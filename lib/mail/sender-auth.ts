import "server-only";

/**
 * 差出人(From)が偽装されていないかを、受信サーバの認証結果(Authentication-Results、RFC 8601)から読む。
 * - fail: DMARC に失敗した。差出人のドメインを名乗る資格の無い送信元から届いた
 * - unverified: DMARC の結果が無く、SPF・DKIM のどちらも通っていない
 * - ok: 確かめられた、または信頼できる認証結果が無い(Gmail 以外のサーバなど)。どちらも画面には何も出さない
 *
 * 認証結果のヘッダは送り手もメールに書き込めるので、信じるのは一番上のもの(最後に受け取った自分側のサーバが付けたもの)で、
 * かつ付けたサーバ(authserv-id)が信頼できるものだけ。偽の「成功」を書かれても警告が出ないだけで、本物らしく見せる表示はしない。
 */
export type SenderAuth = "fail" | "unverified" | "ok";

// 既定は Gmail の受信サーバ。ほかのメールサービスは MAILER_AUTHSERV_IDS にカンマ区切りで足す
const DEFAULT_AUTHSERV_IDS = ["mx.google.com"];

function trustedAuthservIds(): string[] {
  const env = process.env.MAILER_AUTHSERV_IDS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return env?.length ? env : DEFAULT_AUTHSERV_IDS;
}

export function senderAuthFrom(headerLines: readonly { key: string; line: string }[]): SenderAuth {
  const top = headerLines.find((h) => h.key.toLowerCase() === "authentication-results");
  if (!top) return "ok";
  // 折り返しをつなぎ、( ) のコメントを取り除く(コメントには送り手由来のアドレスなどが入る)
  const value = top.line
    .replace(/^[^:]*:/, "")
    .replace(/\r?\n[ \t]+/g, " ")
    .replace(/\([^()]*\)/g, " ");
  const [id, ...rest] = value.split(";");
  const authserv = id.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!trustedAuthservIds().includes(authserv)) return "ok";

  const results = (method: string) =>
    [...rest.join(";").matchAll(new RegExp(`(?:^|[\\s;])${method}=([a-z]+)`, "gi"))].map((m) => m[1].toLowerCase());
  const dmarc = results("dmarc");
  if (dmarc.includes("fail")) return "fail";
  if (dmarc.includes("pass")) return "ok";
  return results("spf").includes("pass") || results("dkim").includes("pass") ? "ok" : "unverified";
}

/** URL などで受け取った値を SenderAuth にする。知らない値は ok(何も出さない) */
export function parseSenderAuth(value: unknown): SenderAuth {
  return value === "fail" || value === "unverified" ? value : "ok";
}

/** 画面と確認ページに出す文言 */
export const SENDER_AUTH_WARNING: Record<Exclude<SenderAuth, "ok">, { level: "危険" | "注意"; message: string }> = {
  fail: {
    level: "危険",
    message: "送信元の認証(DMARC)に失敗しています。差出人のアドレスは偽装されている可能性があります。",
  },
  unverified: {
    level: "注意",
    message: "送信元を確かめられませんでした(SPF・DKIM とも未確認)。差出人の表示をうのみにしないでください。",
  },
};
