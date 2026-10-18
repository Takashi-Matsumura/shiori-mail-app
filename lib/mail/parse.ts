import "server-only";
import { simpleParser, type AddressObject } from "mailparser";
import { senderAuthFrom, type SenderAuth } from "@/lib/mail/sender-auth";

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
  /** 差出人の認証結果(lib/mail/sender-auth.ts) */
  senderAuth: SenderAuth;
};

// 宛先の表示文字列の上限。巨大な To/Cc を持つメールで、スレッドの参加者判定や表示に時間を使わせないため
const ADDRESS_TEXT_LIMIT = 20_000;
// テキストに直す HTML の上限。これより長い本文は、先頭だけを使う(検索・一覧・AI の材料には足りる)
const HTML_TO_TEXT_LIMIT = 500_000;

function addressText(a: AddressObject | AddressObject[] | undefined): string {
  if (!a) return "";
  return (Array.isArray(a) ? a : [a])
    .map((x) => x.text)
    .join(", ")
    .slice(0, ADDRESS_TEXT_LIMIT);
}

/** <style>…</style> と <script>…</script> を中身ごと取り除く。閉じタグが無ければ末尾まで。indexOf だけで進むので、入力の長さに比例する時間で済む */
function stripBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}`;
  let out = "";
  let pos = 0;
  for (;;) {
    const start = lower.indexOf(open, pos);
    if (start < 0) break;
    out += html.slice(pos, start);
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) return out;
    const gt = lower.indexOf(">", end);
    pos = gt < 0 ? lower.length : gt + 1;
  }
  return out + html.slice(pos);
}

/**
 * HTML からテキストを作る。メールの送り手が自由に書ける入力なので、どの正規表現も「長さに比例する時間」で終わるものにしている。
 * 以前の `<[^>]+>` は、閉じない `<` が並ぶと長さの 2 乗の時間がかかり、1 通の取り込みでサーバが止まった。
 */
function htmlToText(html: string): string {
  return stripBlocks(stripBlocks(html.slice(0, HTML_TO_TEXT_LIMIT), "style"), "script")
    .replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr)>/gi, "\n")
    // タグは `<` の次の `<` より手前で必ず止める([^<>])。これで `<` ごとの走査が重ならない
    .replace(/<[^<>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type AttachmentContent = { filename: string; contentType: string; content: Buffer };

/** 転送のために添付の中身を取り出す。並びは parseRaw の attachments と同じなので、番号で対応が取れる。 */
export async function extractAttachments(raw: Buffer): Promise<AttachmentContent[]> {
  const mail = await simpleParser(raw, { skipTextToHtml: true });
  return mail.attachments.map((a) => ({
    filename: a.filename ?? "(名前なし)",
    contentType: a.contentType,
    content: a.content,
  }));
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
    senderAuth: senderAuthFrom(mail.headerLines, from?.address),
  };
}

