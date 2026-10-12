import "server-only";
import { chatJson, embed, resolveModels, AiError, type Usage } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  classifyPrompt,
  classifySchema,
  extractPrompt,
  extractSchema,
  isClassification,
  normalizeItems,
} from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import type { MessageRow } from "@/lib/queries";

export type BatchKind = "classify" | "extract" | "embed";

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

export async function classifyMessage(m: MessageRow): Promise<{ ms: number; summary: string }> {
  const r = await chatJson(getAiConfig(), classifyPrompt(m), "classification", classifySchema);
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
  const { embedModel: model } = await resolveModels(cfg);
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
