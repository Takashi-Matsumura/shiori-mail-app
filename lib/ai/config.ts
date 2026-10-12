import "server-only";
import { getSetting } from "@/lib/db";

export type AiConfig = {
  /** OpenAI 互換 API のベース URL(例: http://localhost:1234/v1) */
  baseUrl: string;
  /** 空なら接続先のモデル一覧から自動で選ぶ */
  chatModel: string;
  embedModel: string;
};

export const DEFAULT_AI_BASE_URL = "http://localhost:1234/v1";

export function getAiConfig(): AiConfig {
  return {
    baseUrl: (getSetting("ai_base_url") || process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, ""),
    chatModel: getSetting("ai_chat_model") || process.env.AI_CHAT_MODEL || "",
    embedModel: getSetting("ai_embed_model") || process.env.AI_EMBED_MODEL || "",
  };
}

/** 接続先がこのマシン自身かどうか。そうでなければメール本文がマシンの外へ出る。 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return false;
  }
}
