// メールの中のリンクを開く前の確認(app/link/page.tsx)で使う、フィッシングの手がかり。
// ここでの判定は手がかりにすぎない。見つからなかったからといって安全とは限らない。

import { getDomain } from "tldts";

export type LinkWarning = { level: "危険" | "注意" | "参考"; message: string };

/** 本当の行き先を隠してしまう短縮 URL */
const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "lnkd.in", "amzn.to", "rebrand.ly", "cutt.ly", "t.ly", "x.gd", "shorturl.at",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * ホスト名から、組織を表す部分(登録ドメイン)を取り出す。例: www.mail.example.co.jp → example.co.jp
 * 区切りは Public Suffix List(tldts)で決める。github.io や herokuapp.com のように誰でも下にサイトを作れるドメイン
 * (PSL の private の部分)も区切りとして扱うので、a.github.io と b.github.io は別の持ち主として比べる。
 */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(h) || h.startsWith("[")) return h;
  // PSL で決まらない名前(サフィックスそのもの、社内の名前など)は、ホスト名のまま比べる
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}

/** リンクの文字が URL やドメインの形なら、そのホスト名を返す(「こちら」などの文字なら null) */
function hostInText(text: string): string | null {
  const t = text.trim();
  const m = t.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

/** 開いてよいリンクか。http / https 以外(javascript: など)は開かない */
export function parseLink(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function checkLink({ url, text, sender, spam }: { url: URL; text: string; sender: string; spam: boolean }): LinkWarning[] {
  const warnings: LinkWarning[] = [];
  const host = url.hostname.toLowerCase();
  const domain = registrableDomain(host);

  if (spam) {
    warnings.push({ level: "危険", message: "このメールは栞が「迷惑」に仕分けています。心当たりがなければ開かないでください。" });
  }
  const shown = hostInText(text);
  if (shown && registrableDomain(shown) !== domain) {
    warnings.push({
      level: "危険",
      message: `メールに表示されていた行き先(${shown})と、本当の行き先(${host})が違います。偽サイトによくある手口です。`,
    });
  }
  if (url.username || url.password) {
    warnings.push({
      level: "危険",
      message: `URL の「@」より前は飾りで、本当の行き先は ${host} です。有名なサイトに見せかける手口です。`,
    });
  }
  if (IPV4.test(host) || host.startsWith("[")) {
    warnings.push({ level: "危険", message: "行き先がドメイン名ではなく IP アドレスです。正規のサービスではまず使われません。" });
  }
  if (host.split(".").some((l) => l.startsWith("xn--"))) {
    warnings.push({
      level: "注意",
      message: "行き先に、英字以外の文字を含むドメイン(国際化ドメイン)が使われています。見た目のよく似た偽ドメインに使われることがあります。",
    });
  }
  if (url.protocol === "http:") {
    warnings.push({ level: "注意", message: "暗号化されていない接続(http)です。パスワードやカード番号は入力しないでください。" });
  }
  if (SHORTENERS.has(domain) || SHORTENERS.has(host)) {
    warnings.push({ level: "注意", message: "短縮 URL です。開くまで本当の行き先が分かりません。" });
  }
  const senderDomain = sender.includes("@") ? registrableDomain(sender.split("@").pop() ?? "") : "";
  if (senderDomain && senderDomain !== domain) {
    warnings.push({
      level: "参考",
      message: `差出人のドメイン(${senderDomain})とリンク先のドメイン(${domain})が違います。配信サービス経由のメールではよくあることです。`,
    });
  }
  return warnings;
}
