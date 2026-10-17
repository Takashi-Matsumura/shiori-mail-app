// 埋め込みベクトルを使った近傍法(k-NN)の仕分け。似たメールに付いている仕分けを、似ている度合いで重み付けして多数決する。
// 評価スクリプト(scripts/eval-classifier.mts)からも読み込むので、server-only や "@/" の実体 import を持たせない。

/** 近い順にいくつのメールを見るか */
export const KNN_K = 7;
/** 教師データがこれより少ないうちは推定しない(会話用モデルに任せる) */
export const KNN_MIN_EXAMPLES = 20;
/** カテゴリと優先度の両方で、票の割合がこれ以上なら採用する */
export const KNN_CONFIDENCE = 0.7;
/**
 * いちばん近いメールでもこれより似ていなければ、見たことのない種類のメールとみなして推定しない。
 * 架空のサンプルメール 25 通での評価(npm run ai:eval)では、0.6 だと採用した分の 4 割が会話用モデルと食い違ったので、慎重にしておく。
 */
export const KNN_MIN_SIMILARITY = 0.7;
/** あなたが確定した仕分けは、AI の判定より重く数える */
export const USER_LABEL_WEIGHT = 3;
/** 保存する結果の model 欄。教師データから自分自身の推定を除くための目印も兼ねる */
export const KNN_MODEL_PREFIX = "近傍法";
/** あなたが確定した仕分けを ai_results に保存するときの model 欄 */
export const USER_LABEL_MODEL = "あなた";

export type Example = { messageId: number; vector: Float32Array; category: string; priority: string; weight: number };
export type Vote = { label: string; confidence: number };
export type KnnResult = { category: Vote; priority: Vote; topSimilarity: number; neighbors: number; confident: boolean };
export type KnnOptions = { k?: number; confidence?: number; minSimilarity?: number; minExamples?: number };

/**
 * 教師データの読み出し。受信トレイで、同じ埋め込みモデルのベクトルがあり、仕分けの答えがあるメール。
 * 答えは、あなたの確定(classify_labels)を優先し、無ければ会話用モデルなどの判定(近傍法自身の推定は除く)。
 * 手元から消えたメールの手本(kept_examples)も加える。ただし同じメールを取り込み直して、同じベクトルの手本が手元にあれば、そちらを使う
 * (Message-ID は差出人が自由に決められるので、重なりの判定には使わない)。
 * 消えたメールの messageId は、手元のメールと重ならないよう負の数にする。
 * 引数: ?1 = account, ?2 = 埋め込みモデル名
 */
export const EXAMPLES_SQL = `
  SELECT m.id AS messageId, e.vector AS vector,
         COALESCE(l.category, json_extract(a.result, '$.category')) AS category,
         COALESCE(l.priority, json_extract(a.result, '$.priority')) AS priority,
         l.message_id IS NOT NULL AS labeled
  FROM messages m
  JOIN embeddings e ON e.message_id = m.id
  LEFT JOIN classify_labels l ON l.message_id = m.id
  LEFT JOIN ai_results a ON a.message_id = m.id AND a.kind = 'classify' AND a.model NOT LIKE '${KNN_MODEL_PREFIX}%'
  WHERE m.account = ?1 AND m.mailbox = 'inbox' AND e.model = ?2
    AND (l.message_id IS NOT NULL OR a.id IS NOT NULL)
  UNION ALL
  SELECT -x.id AS messageId, x.vector AS vector, x.category AS category, x.priority AS priority, x.labeled AS labeled
  FROM kept_examples x
  WHERE x.account = ?1 AND x.model = ?2
    AND NOT EXISTS (
      SELECT 1 FROM messages k JOIN embeddings ke ON ke.message_id = k.id
      WHERE k.account = x.account AND k.mailbox = 'inbox' AND ke.model = x.model AND ke.vector = x.vector
        -- 取り込み直したほうも手本になっている(確定か、近傍法以外の判定がある)ときだけ、そちらに譲る
        AND (EXISTS (SELECT 1 FROM classify_labels kl WHERE kl.message_id = k.id)
          OR EXISTS (SELECT 1 FROM ai_results ka WHERE ka.message_id = k.id AND ka.kind = 'classify' AND ka.model NOT LIKE '${KNN_MODEL_PREFIX}%'))
    )`;

export type ExampleRow = { messageId: number; vector: Uint8Array; category: string | null; priority: string | null; labeled: number };

export function toVector(blob: Uint8Array): Float32Array {
  // byteOffset が 4 の倍数とは限らないので、コピーしてから読む
  return new Float32Array(blob.slice().buffer);
}

export function toExamples(rows: ExampleRow[]): Example[] {
  return rows
    .filter((r) => r.category && r.priority)
    .map((r) => ({
      messageId: r.messageId,
      vector: toVector(r.vector),
      category: r.category!,
      priority: r.priority!,
      weight: r.labeled ? USER_LABEL_WEIGHT : 1,
    }));
}

/** 保存済みのベクトルは長さ 1 に正規化してあるので、内積がそのままコサイン類似度になる。 */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function vote(neighbors: { example: Example; similarity: number }[], pick: (e: Example) => string): Vote {
  const tally = new Map<string, number>();
  let total = 0;
  for (const { example, similarity } of neighbors) {
    const w = example.weight * Math.max(similarity, 0);
    tally.set(pick(example), (tally.get(pick(example)) ?? 0) + w);
    total += w;
  }
  let best = { label: "", confidence: 0 };
  for (const [label, w] of tally) if (w > best.confidence) best = { label, confidence: w };
  return { label: best.label, confidence: total > 0 ? best.confidence / total : 0 };
}

/** 推定できるだけの材料が無ければ null。推定しても自信が足りなければ confident: false。 */
export function knnClassify(vector: Float32Array, examples: Example[], options: KnnOptions = {}): KnnResult | null {
  const { k = KNN_K, confidence = KNN_CONFIDENCE, minSimilarity = KNN_MIN_SIMILARITY, minExamples = KNN_MIN_EXAMPLES } = options;
  const usable = examples.filter((e) => e.vector.length === vector.length);
  if (usable.length < minExamples) return null;
  const neighbors = usable
    .map((example) => ({ example, similarity: dot(vector, example.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
  const category = vote(neighbors, (e) => e.category);
  const priority = vote(neighbors, (e) => e.priority);
  const topSimilarity = neighbors[0]?.similarity ?? 0;
  return {
    category,
    priority,
    topSimilarity,
    neighbors: neighbors.length,
    confident: topSimilarity >= minSimilarity && category.confidence >= confidence && priority.confidence >= confidence,
  };
}
