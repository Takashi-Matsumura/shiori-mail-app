import "server-only";
import { getSetting } from "@/lib/db";

export type AiConfig = {
  /** OpenAI 互換 API のベース URL(例: http://localhost:1234/v1) */
  baseUrl: string;
  /** 埋め込み用の接続先。llama-server のようにモデルごとにサーバが分かれる場合に使う(未設定なら baseUrl と同じ) */
  embedBaseUrl: string;
  /** 空なら接続先のモデル一覧から自動で選ぶ */
  chatModel: string;
  embedModel: string;
  /** 回答の前にモデルに考えさせるか。丁寧になるが、待ち時間が何倍にも延びる */
  thinking: boolean;
  /** 仕分けで、まず似たメールの仕分けから推定する(近傍法)。自信が無いときだけ会話用モデルに聞く */
  classifyKnn: boolean;
};

export const DEFAULT_AI_BASE_URL = "http://localhost:8080/v1";

const trim = (url: string) => url.replace(/\/+$/, "");

export function getAiConfig(): AiConfig {
  const baseUrl = trim(getSetting("ai_base_url") || process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL);
  return {
    baseUrl,
    embedBaseUrl: trim(getSetting("ai_embed_base_url") || process.env.AI_EMBED_BASE_URL || "") || baseUrl,
    chatModel: getSetting("ai_chat_model") || process.env.AI_CHAT_MODEL || "",
    embedModel: getSetting("ai_embed_model") || process.env.AI_EMBED_MODEL || "",
    thinking: getSetting("ai_thinking") === "on",
    classifyKnn: getSetting("ai_classify_knn") !== "off",
  };
}

/** 接続先がこのマシン自身かどうか。そうでなければメール本文がマシンの外へ出る。 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    // 127. で始まるだけの名前(127.example.com など)を通さないよう、IPv4 の形まで確かめる
    return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}
