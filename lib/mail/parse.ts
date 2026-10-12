import "server-only";
import { simpleParser, type AddressObject } from "mailparser";

export type ParsedMail = {
  messageId: string | null;
  inReplyTo: string | null;
  refs: string[];
  subject: string;
  fromName: string;
  fromAddr: string;
  toText: string;
  ccText: string;
  date: Date | null;
  text: string;
  html: string | null;
  attachments: { filename: string; contentType: string; size: number }[];
};

function addressText(a: AddressObject | AddressObject[] | undefined): string {
  if (!a) return "";
  return (Array.isArray(a) ? a : [a]).map((x) => x.text).join(", ");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** RFC 5322 形式の生データを、表示や検索に使う項目へ分解する。 */
export async function parseRaw(raw: Buffer): Promise<ParsedMail> {
  const mail = await simpleParser(raw, { skipTextToHtml: true });
  const from = mail.from?.value[0];
  const html = typeof mail.html === "string" ? mail.html : null;
  const refs = mail.references ? (Array.isArray(mail.references) ? mail.references : [mail.references]) : [];
  return {
    messageId: mail.messageId ?? null,
    inReplyTo: mail.inReplyTo ?? null,
    refs,
    subject: mail.subject ?? "",
    fromName: from?.name ?? "",
    fromAddr: from?.address ?? "",
    toText: addressText(mail.to),
    ccText: addressText(mail.cc),
    date: mail.date ?? null,
    text: mail.text?.trim() || (html ? htmlToText(html) : ""),
    html,
    attachments: mail.attachments.map((a) => ({
      filename: a.filename ?? "(名前なし)",
      contentType: a.contentType,
      size: a.size,
    })),
  };
}

/** 生データをヘッダ部と本文部に分ける(最初の空行が境界)。 */
export function splitRaw(raw: Buffer): { header: string; body: string } {
  const text = raw.toString("utf8");
  const m = /\r?\n\r?\n/.exec(text);
  if (!m) return { header: text, body: "" };
  return { header: text.slice(0, m.index), body: text.slice(m.index + m[0].length) };
}

/** 折り返し(継続行)を畳んで、ヘッダを名前と値の並びにする。 */
export function parseHeaderLines(header: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const line of header.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1].value += " " + line.trim();
      continue;
    }
    const i = line.indexOf(":");
    if (i > 0) out.push({ name: line.slice(0, i), value: line.slice(i + 1).trim() });
  }
  return out;
}
