// 近傍法の仕分けの精度を測る。DB には書き込まない。外部へも送らない。
// 実行: npm run ai:eval
//
// 1 通ずつ「そのメール以外」を手本にして推定し(leave-one-out)、答えと比べる。答えは 2 種類。
// - あなたが確定した仕分け: 正解。AI(会話用モデルなど)が確定前に出していた判定の正解率も並べる
// - 会話用モデルの判定: 正解ではなく、会話用モデルとどれだけ一致するか(会話用モデルの代わりが務まるか)の目安
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  EXAMPLES_SQL,
  KNN_CONFIDENCE,
  KNN_MIN_SIMILARITY,
  KNN_MODEL_PREFIX,
  knnClassify,
  toExamples,
  type Example,
  type ExampleRow,
  type KnnOptions,
} from "../lib/ai/knn.ts";

const db = new DatabaseSync(path.join(process.cwd(), "data", "mailer.db"), { readOnly: true });
const hasLabels = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'classify_labels'").get();
if (!hasLabels) {
  console.error("classify_labels がまだありません。開発サーバを一度起動し直してから実行してください。");
  process.exit(1);
}
// アカウントの識別子は "real" だけ(lib/accounts.ts)
const account = "real";
const embedModel = (
  db
    .prepare("SELECT e.model FROM embeddings e JOIN messages m ON m.id = e.message_id WHERE m.account = ? GROUP BY e.model ORDER BY COUNT(*) DESC LIMIT 1")
    .get(account) as { model: string } | undefined
)?.model;
if (!embedModel) {
  console.error(`アカウント ${account} には埋め込みがありません。先に検索用の索引を作ってください。`);
  process.exit(1);
}

const rows = db.prepare(EXAMPLES_SQL).all(account, embedModel) as ExampleRow[];
const examples = toExamples(rows);
const labeled = new Set(rows.filter((r) => r.labeled).map((r) => r.messageId));
const truths = db
  .prepare(
    `SELECT l.message_id AS id, l.category, l.priority, l.ai_model, l.ai_category, l.ai_priority
     FROM classify_labels l JOIN messages m ON m.id = l.message_id WHERE m.account = ?`,
  )
  .all(account) as { id: number; category: string; priority: string; ai_model: string | null; ai_category: string | null; ai_priority: string | null }[];

const pct = (n: number, d: number) => (d === 0 ? "   —" : `${String(Math.round((n / d) * 100)).padStart(3)}%`);

/** 答えの付いたメールを 1 通ずつ外して推定し、答えと比べる */
function evaluate(targets: Example[], options: KnnOptions) {
  let covered = 0;
  let category = 0;
  let priority = 0;
  let allCategory = 0;
  let allPriority = 0;
  let predicted = 0;
  for (const t of targets) {
    const r = knnClassify(
      t.vector,
      examples.filter((e) => e.messageId !== t.messageId),
      options,
    );
    if (!r) continue;
    predicted++;
    if (r.category.label === t.category) allCategory++;
    if (r.priority.label === t.priority) allPriority++;
    if (!r.confident) continue;
    covered++;
    if (r.category.label === t.category) category++;
    if (r.priority.label === t.priority) priority++;
  }
  return { n: targets.length, predicted, covered, category, priority, allCategory, allPriority };
}

function report(title: string, targets: Example[]) {
  console.log(`\n■ ${title}(${targets.length} 通)`);
  if (targets.length === 0) {
    console.log("  対象がまだありません。");
    return;
  }
  const all = evaluate(targets, { confidence: 0, minSimilarity: -1 });
  if (all.predicted === 0) {
    console.log("  手本が足りず、推定できませんでした。");
    return;
  }
  console.log(`  いつも近傍法で答えた場合: カテゴリ ${pct(all.allCategory, all.predicted)} ・ 優先度 ${pct(all.allPriority, all.predicted)}`);
  console.log("  自信があるものだけ採用した場合(残りは会話用モデルへ):");
  console.log("    確信度  最低類似度  採用率  カテゴリ  優先度");
  const settings: [number, number][] = [
    [0.5, KNN_MIN_SIMILARITY],
    [0.6, KNN_MIN_SIMILARITY],
    [KNN_CONFIDENCE, KNN_MIN_SIMILARITY],
    [0.8, KNN_MIN_SIMILARITY],
    [0.9, KNN_MIN_SIMILARITY],
    [KNN_CONFIDENCE, 0.6],
    [KNN_CONFIDENCE, 0.8],
  ];
  for (const [confidence, minSimilarity] of settings) {
    const r = evaluate(targets, { confidence, minSimilarity });
    const mark = confidence === KNN_CONFIDENCE && minSimilarity === KNN_MIN_SIMILARITY ? " ← いまの設定" : "";
    console.log(
      `    ${confidence.toFixed(1).padStart(6)}  ${minSimilarity.toFixed(1).padStart(10)}  ${pct(r.covered, r.n).padStart(6)}  ${pct(r.category, r.covered).padStart(8)}  ${pct(r.priority, r.covered).padStart(6)}${mark}`,
    );
  }
}

console.log(`アカウント: ${account} ・ 埋め込みモデル: ${embedModel}`);
console.log(`手本: ${examples.length} 通(あなたの確定 ${labeled.size} 通・ほかは会話用モデルなどの判定)`);

report(
  "あなたが確定した仕分けを正解として",
  examples.filter((e) => labeled.has(e.messageId)),
);
const judged = truths.filter((t) => t.ai_category && t.ai_priority);
if (judged.length > 0) {
  const byKind = (knn: boolean) => judged.filter((t) => (t.ai_model ?? "").startsWith(KNN_MODEL_PREFIX) === knn);
  for (const [name, list] of [
    ["会話用モデルなど", byKind(false)],
    ["近傍法", byKind(true)],
  ] as const) {
    if (list.length === 0) continue;
    const c = list.filter((t) => t.ai_category === t.category).length;
    const p = list.filter((t) => t.ai_priority === t.priority).length;
    console.log(`  参考: 確定前の${name}の判定の正解率(${list.length} 通): カテゴリ ${pct(c, list.length)} ・ 優先度 ${pct(p, list.length)}`);
  }
}

report(
  "会話用モデルの判定との一致(正解率ではありません)",
  examples.filter((e) => !labeled.has(e.messageId)),
);
