import "server-only";
import type { AiConfig } from "@/lib/ai/config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type Usage = { promptTokens: number | null; completionTokens: number | null };

export class AiError extends Error {}

const CHAT_TIMEOUT_MS = 180_000;

async function request(cfg: AiConfig, path: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    throw new AiError(
      timedOut
        ? `AI サーバ (${cfg.baseUrl}) の応答が時間内に返りませんでした。`
        : `AI サーバ (${cfg.baseUrl}) に接続できません。LM Studio などのローカルサーバが起動しているか確認してください。`,
    );
  }
  return res;
}

async function failure(res: Response): Promise<AiError> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  return new AiError(`AI サーバがエラーを返しました (HTTP ${res.status}) ${body}`);
}

export async function listModels(cfg: AiConfig): Promise<string[]> {
  const res = await request(cfg, "/models", undefined, 5_000);
  if (!res.ok) throw await failure(res);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}

const isEmbeddingModel = (id: string) => /embed/i.test(id);

/** モデル未設定のとき、接続先の一覧から会話用と埋め込み用を選ぶ。 */
export async function resolveModels(cfg: AiConfig): Promise<{ chatModel: string; embedModel: string }> {
  if (cfg.chatModel && cfg.embedModel) return { chatModel: cfg.chatModel, embedModel: cfg.embedModel };
  const models = await listModels(cfg);
  return {
    chatModel: cfg.chatModel || models.find((m) => !isEmbeddingModel(m)) || "",
    embedModel: cfg.embedModel || models.find(isEmbeddingModel) || "",
  };
}

/**
 * 思考過程(<think>…</think>)を出力するモデル向けに、その部分を取り除きながら流すフィルタ。
 * タグが途中で切れて届くことがあるので、タグの書きかけは次の断片が来るまで保留する。
 */
export function createThinkFilter() {
  let full = "";
  let emitted = 0;
  const OPEN = "<think>";
  return {
    push(chunk: string): string {
      full += chunk;
      let clean = full.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
      const open = clean.indexOf(OPEN);
      if (open >= 0) clean = clean.slice(0, open);
      else {
        for (let n = Math.min(OPEN.length - 1, clean.length); n > 0; n--) {
          if (OPEN.startsWith(clean.slice(-n))) {
            clean = clean.slice(0, -n);
            break;
          }
        }
      }
      if (emitted === 0) clean = clean.replace(/^\s+/, "");
      const out = clean.slice(emitted);
      emitted = clean.length;
      return out;
    },
  };
}

export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

type ChatOptions = { temperature?: number; maxTokens?: number };
export type ChatEvent = { type: "delta"; text: string } | { type: "done"; usage: Usage; model: string };

/** /chat/completions をストリーミングで呼び、本文の断片を順に返す。 */
export async function* chatStream(cfg: AiConfig, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<ChatEvent> {
  const { chatModel } = await resolveModels(cfg);
  if (!chatModel) throw new AiError("会話用のモデルが見つかりません。設定画面でモデルを選んでください。");
  const res = await request(
    cfg,
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: chatModel,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1500,
        stream: true,
        stream_options: { include_usage: true },
      }),
    },
    CHAT_TIMEOUT_MS,
  );
  if (!res.ok || !res.body) throw await failure(res);

  const filter = createThinkFilter();
  const usage: Usage = { promptTokens: null, completionTokens: null };
  const decoder = new TextDecoder();
  let buffer = "";
  // SSE: 「data: {json}」の行が届き、「data: [DONE]」で終わる
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json: { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.usage) {
        usage.promptTokens = json.usage.prompt_tokens ?? null;
        usage.completionTokens = json.usage.completion_tokens ?? null;
      }
      const text = json.choices?.[0]?.delta?.content;
      if (text) {
        const out = filter.push(text);
        if (out) yield { type: "delta", text: out };
      }
    }
  }
  yield { type: "done", usage, model: chatModel };
}

function extractJson(text: string): unknown {
  const clean = stripThink(text).replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiError("AI の応答から JSON を取り出せませんでした。");
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new AiError("AI の応答が JSON として壊れていました。");
  }
}

/** JSON スキーマに沿った構造化出力を得る。スキーマ指定を受け付けない接続先には指定なしで再試行する。 */
export async function chatJson(
  cfg: AiConfig,
  messages: ChatMessage[],
  schemaName: string,
  schema: object,
): Promise<{ value: unknown; usage: Usage; model: string; ms: number }> {
  const { chatModel } = await resolveModels(cfg);
  if (!chatModel) throw new AiError("会話用のモデルが見つかりません。設定画面でモデルを選んでください。");
  const started = Date.now();
  const call = (withSchema: boolean) =>
    request(
      cfg,
      "/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({
          model: chatModel,
          messages,
          temperature: 0,
          max_tokens: 1500,
          ...(withSchema ? { response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } } } : {}),
        }),
      },
      CHAT_TIMEOUT_MS,
    );
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  if (!res.ok) throw await failure(res);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    value: extractJson(json.choices?.[0]?.message?.content ?? ""),
    usage: { promptTokens: json.usage?.prompt_tokens ?? null, completionTokens: json.usage?.completion_tokens ?? null },
    model: chatModel,
    ms: Date.now() - started,
  };
}

/** 文章を埋め込みベクトルにする。返すベクトルは長さ 1 に正規化済み(内積がそのままコサイン類似度になる)。 */
export async function embed(cfg: AiConfig, inputs: string[]): Promise<{ vectors: Float32Array[]; model: string }> {
  const { embedModel } = await resolveModels(cfg);
  if (!embedModel) throw new AiError("埋め込み用のモデルが見つかりません。設定画面でモデルを選んでください。");
  const res = await request(cfg, "/embeddings", { method: "POST", body: JSON.stringify({ model: embedModel, input: inputs }) }, 60_000);
  if (!res.ok) throw await failure(res);
  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (data.length !== inputs.length) throw new AiError("埋め込みの件数が入力と一致しません。");
  const vectors = data.map((d) => {
    const v = Float32Array.from(d.embedding);
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  });
  return { vectors, model: embedModel };
}
