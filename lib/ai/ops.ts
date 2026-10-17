import "server-only";
import { chatJson, embed, resolveEmbedModel, AiError, type Usage } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { EXAMPLES_SQL, KNN_K, KNN_MODEL_PREFIX, knnClassify, toExamples, toVector, type ExampleRow } from "@/lib/ai/knn";
import {
  classifyPrompt,
  classifySchema,
  closurePrompt,
  closureSchema,
  isClosure,
  extractPrompt,
  extractSchema,
  isClassification,
  normalizeItems,
} from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import type { MessageRow } from "@/lib/queries";

export type BatchKind = "classify" | "extract" | "embed" | "closure";

export function saveAiResult(messageId: number, kind: string, model: string, result: string, ms: number, usage: Usage): void {
  getDb()
    .prepare(
      `INSERT INTO ai_results (message_id, kind, model, result, ms, prompt_tokens, completion_tokens, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (message_id, kind) DO UPDATE SET model = excluded.model, result = excluded.result, ms = excluded.ms,
         prompt_tokens = excluded.prompt_tokens, completion_tokens = excluded.completion_tokens, created = excluded.created`,
    )
    .run(messageId, kind, model, result, ms, usage.promptTokens, usage.completionTokens, Date.now());
}

/** あなたが確定した仕分けがあるか。あれば AI の処理で上書きしない。 */
export function hasUserLabel(messageId: number): boolean {
  return !!getDb().prepare("SELECT 1 FROM classify_labels WHERE message_id = ?").get(messageId);
}

/**
 * 似たメールの仕分けから推定する。埋め込みがまだ無ければ作る。
 * 推定できない・自信が足りないときは null を返し、呼び出し側が会話用モデルに回す。
 */
async function classifyMessageWithKnn(m: MessageRow): Promise<{ ms: number; summary: string } | null> {
  const started = Date.now();
  const db = getDb();
  const read = () => db.prepare("SELECT model, vector FROM embeddings WHERE message_id = ?").get(m.id) as { model: string; vector: Uint8Array } | undefined;
  let row = read();
  if (!row) {
    // 埋め込みサーバが落ちていても仕分けは止めず、会話用モデルに任せる
    const ok = await embedMessage(m).then(() => true, () => false);
    if (!ok) return null;
    row = read();
    if (!row) return null;
  }
  const examples = toExamples(db.prepare(EXAMPLES_SQL).all(m.account, row.model) as ExampleRow[]).filter((e) => e.messageId !== m.id);
  const r = knnClassify(toVector(row.vector), examples);
  if (!r?.confident) return null;
  const percent = (n: number) => `${Math.round(n * 100)}%`;
  const value = {
    category: r.category.label,
    priority: r.priority.label,
    reason: `よく似たメール ${r.neighbors} 通の仕分けから推定(確信度 カテゴリ ${percent(r.category.confidence)}・優先度 ${percent(r.priority.confidence)})`,
  };
  if (!isClassification(value)) return null;
  const ms = Date.now() - started;
  saveAiResult(m.id, "classify", `${KNN_MODEL_PREFIX} k=${KNN_K} / ${row.model}`, JSON.stringify(value), ms, { promptTokens: null, completionTokens: null });
  return { ms, summary: `${value.category} / 優先度 ${value.priority}(近傍法)` };
}

/** preferLlm: 近傍法を飛ばして会話用モデルに聞く(画面の「やり直す」) */
export async function classifyMessage(m: MessageRow, options: { preferLlm?: boolean } = {}): Promise<{ ms: number; summary: string }> {
  if (hasUserLabel(m.id)) return { ms: 0, summary: "あなたが確定済み" };
  const cfg = getAiConfig();
  if (cfg.classifyKnn && !options.preferLlm) {
    const knn = await classifyMessageWithKnn(m);
    if (knn) return knn;
  }
  const r = await chatJson(cfg, classifyPrompt(m), "classification", classifySchema);
  if (!isClassification(r.value)) throw new AiError("分類結果が想定した形ではありませんでした。");
  saveAiResult(m.id, "classify", r.model, JSON.stringify(r.value), r.ms, r.usage);
  return { ms: r.ms, summary: `${r.value.category} / 優先度 ${r.value.priority}` };
}

export async function extractFromMessage(m: MessageRow): Promise<{ ms: number; summary: string }> {
  const r = await chatJson(getAiConfig(), extractPrompt(m, Date.now()), "extraction", extractSchema);
  const items = normalizeItems(r.value);
  saveAiResult(m.id, "extract", r.model, JSON.stringify({ items }), r.ms, r.usage);
  return { ms: r.ms, summary: `${items.length} 件` };
}

/** 判断に渡すのは、対象のメールまでのやり取りの直近この通数まで(長いスレッドで待たされすぎないように) */
const CLOSURE_THREAD_LIMIT = 6;

/** やり取りが終わっていそうかを判断する。対象のメールまで(日時がそれ以前)のスレッドを、送信済みも含めて読ませる */
export async function closureForMessage(m: MessageRow): Promise<{ ms: number; summary: string }> {
  const thread = (
    m.thread_key
      ? (getDb()
          .prepare("SELECT * FROM messages WHERE account = ? AND thread_key = ? AND date <= ? AND id != ? ORDER BY date ASC")
          .all(m.account, m.thread_key, m.date, m.id) as MessageRow[])
      : []
  )
    .slice(-(CLOSURE_THREAD_LIMIT - 1))
    .map((t) => ({ ...t, sent: t.mailbox === "sent" }));
  const r = await chatJson(getAiConfig(), closurePrompt([...thread, { ...m, sent: false }]), "closure", closureSchema);
  if (!isClosure(r.value)) throw new AiError("判断の結果が想定した形ではありませんでした。");
  const value = { status: r.value.status, reason: r.value.reason.replace(/\s+/g, " ").trim().slice(0, 80) };
  saveAiResult(m.id, "closure", r.model, JSON.stringify(value), r.ms, r.usage);
  return { ms: r.ms, summary: value.status };
}

/** 埋め込みモデルによっては、文書と検索語に別々の接頭辞を付けると精度が上がる(nomic-embed-text など)。 */
function withPrefix(model: string, kind: "document" | "query", text: string): string {
  if (/nomic/i.test(model)) return `search_${kind}: ${text}`;
  return text;
}

function embeddingText(m: MessageRow): string {
  return `件名: ${m.subject}\n差出人: ${m.from_name}\n${m.text.slice(0, 1500)}`;
}

export async function embedMessage(m: MessageRow): Promise<{ ms: number; summary: string }> {
  const cfg = getAiConfig();
  const started = Date.now();
  const model = await resolveEmbedModel(cfg);
  const { vectors, model: used } = await embed({ ...cfg, embedModel: model }, [withPrefix(model, "document", embeddingText(m))]);
  getDb()
    .prepare(
      "INSERT INTO embeddings (message_id, model, vector) VALUES (?, ?, ?) ON CONFLICT (message_id) DO UPDATE SET model = excluded.model, vector = excluded.vector",
    )
    .run(m.id, used, new Uint8Array(vectors[0].buffer));
  return { ms: Date.now() - started, summary: `${vectors[0].length} 次元` };
}

export type SemanticHit = { messageId: number; score: number };

/** 検索語を埋め込み、保存済みの全メールとのコサイン類似度で並べる。 */
export async function semanticSearch(account: string, query: string, limit = 10): Promise<{ hits: SemanticHit[]; model: string; ms: number; indexed: number }> {
  const cfg = getAiConfig();
  const started = Date.now();
  const rows = getDb()
    .prepare("SELECT e.message_id, e.model, e.vector FROM embeddings e JOIN messages m ON m.id = e.message_id WHERE m.account = ?")
    .all(account) as { message_id: number; model: string; vector: Uint8Array }[];
  if (rows.length === 0) return { hits: [], model: "", ms: 0, indexed: 0 };
  // 文書側と同じモデルで検索語を埋め込まないと、比較に意味がない
  const model = rows[0].model;
  const { vectors } = await embed({ ...cfg, embedModel: model }, [withPrefix(model, "query", query)]);
  const q = vectors[0];
  const hits: SemanticHit[] = [];
  for (const r of rows) {
    if (r.model !== model) continue;
    const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4);
    if (v.length !== q.length) continue;
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i] * v[i];
    hits.push({ messageId: r.message_id, score: dot });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit), model, ms: Date.now() - started, indexed: rows.length };
}
