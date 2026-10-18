import "server-only";
import { getDomain } from "tldts";

/**
 * 差出人(From)が偽装されていないかを、受信サーバの認証結果(Authentication-Results、RFC 8601)から読む。
 * - fail: DMARC に失敗した。差出人のドメインを名乗る資格の無い送信元から届いた
 * - unverified: DMARC の結果が無く、From のドメインと揃った(アラインメントのある)SPF・DKIM の成功も無い
 * - ok: 確かめられた、または信頼できる認証結果が無い(Gmail 以外のサーバなど)。どちらも画面には何も出さない
 *
 * 認証結果のヘッダは送り手もメールに書き込めるので、信じるのは一番上のもの(最後に受け取った自分側のサーバが付けたもの)で、
 * かつ付けたサーバ(authserv-id)が信頼できるものだけ。偽の「成功」を書かれても警告が出ないだけで、本物らしく見せる表示はしない。
 *
 * DMARC の結果が無いときは、SPF・DKIM の成功を「From のドメインと揃っているもの」に限る。
 * 揃っているかを見ないと、攻撃者が自分のドメインで SPF・DKIM を通し、From だけ他人のドメインにしても警告が出ない。
 */
export type SenderAuth = "fail" | "unverified" | "ok";

// 既定は Gmail の受信サーバ。ほかのメールサービスは MAILER_AUTHSERV_IDS にカンマ区切りで足す
const DEFAULT_AUTHSERV_IDS = ["mx.google.com"];

function trustedAuthservIds(): string[] {
  const env = process.env.MAILER_AUTHSERV_IDS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return env?.length ? env : DEFAULT_AUTHSERV_IDS;
}

type MethodResult = { method: string; result: string; props: Map<string, string> };

/**
 * `dkim=pass header.i=@x.example header.s=sel` のような 1 区切りを、方式・結果・付随する値に分ける。
 * 空白で区切る簡単な読み方なので、引用符を含む値(`"a b"@x.example` のような送信元アドレス)は区切りがずれて読み違えうる。
 * そうした区切りと、同じ名前の値が 2 度出る区切りは、丸ごと読まない(読まなければ「成功」には数えないので、安全側に倒れる)
 */
function parseResult(segment: string): MethodResult | null {
  if (segment.includes('"')) return null;
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  const head = tokens.shift()?.match(/^([a-z0-9-]+)=([a-z]+)$/i);
  if (!head) return null;
  const props = new Map<string, string>();
  for (const t of tokens) {
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).toLowerCase();
    if (props.has(key)) return null;
    props.set(key, t.slice(eq + 1));
  }
  return { method: head[1].toLowerCase(), result: head[2].toLowerCase(), props };
}

/**
 * `@x.example`・`user@x.example`・`x.example` のどれでも、組織を表すドメイン(登録ドメイン)にそろえる。
 * github.io のように誰でも下にサイトやアドレスを持てるドメインも区切りにする(allowPrivateDomains)。
 * そうしないと evil.github.io の署名で victim.github.io を名乗れてしまう
 */
function orgDomain(value: string | undefined): string | null {
  if (!value) return null;
  const host = value.slice(value.lastIndexOf("@") + 1).toLowerCase().replace(/\.$/, "");
  return host ? (getDomain(host, { allowPrivateDomains: true }) ?? host) : null;
}

export function senderAuthFrom(headerLines: readonly { key: string; line: string }[], fromAddr: string | undefined): SenderAuth {
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

  const results = rest.map(parseResult).filter((r): r is MethodResult => r !== null);
  const dmarc = results.filter((r) => r.method === "dmarc").map((r) => r.result);
  if (dmarc.includes("fail")) return "fail";
  if (dmarc.includes("pass")) return "ok";

  // DMARC の結果が無いときは、From と同じ組織のドメインで成功した SPF か DKIM があるかを見る(DMARC の relaxed alignment と同じ基準)
  const from = orgDomain(fromAddr);
  if (!from) return "unverified";
  const aligned = results.some((r) => {
    if (r.result !== "pass") return false;
    // DKIM は署名したドメイン(header.d)を優先し、無ければ header.i。SPF は smtp.mailfrom だけ(HELO は From とは別物なので比べない)
    if (r.method === "dkim") return orgDomain(r.props.get("header.d") ?? r.props.get("header.i")) === from;
    if (r.method === "spf") return orgDomain(r.props.get("smtp.mailfrom")) === from;
    return false;
  });
  return aligned ? "ok" : "unverified";
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
    message: "送信元を確かめられませんでした(差出人のドメインで通った SPF・DKIM がありません)。差出人の表示をうのみにしないでください。",
  },
};
