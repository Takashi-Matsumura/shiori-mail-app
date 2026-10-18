import "server-only";
import type { DatabaseSync } from "node:sqlite";

const ADDRESS = /[^\s<>,;"']+@[^\s<>,;"']+/g;
const MAX_REFS = 50;

/** From・To・Cc の表示文字列から、メールアドレスだけを小文字で取り出す */
function addresses(text: string): string[] {
  return (text.match(ADDRESS) ?? []).map((a) => a.toLowerCase());
}

type Headers = { messageId: string | null; inReplyTo: string | null; refs: string[]; fromAddr: string };

/**
 * 取り込むメールのスレッド(thread_key)を決める。
 * 送信済み(自分が出したもの)は References の先頭をそのまま使う。返信元を取り込んでいなくても、同じ相手とのやり取りをまとめるため。
 * 受信したメールは References・In-Reply-To を誰でも書けるので、次の両方を満たすときだけ既存のスレッドに入れる。
 * - 参照しているメールが手元にある
 * - 差出人が、そのスレッドの From・To・Cc のどこかに出てくる(やり取りの参加者)
 * 満たさなければ、そのメールだけのスレッドにする。Message-ID を知っているだけの第三者が、
 * 本物の会話に紛れ込んだり、返信済み・完了の扱いを引き継いだりできないように。
 */
export function threadKeyFor(db: DatabaseSync, account: string, mailbox: string, mail: Headers): string | null {
  if (mailbox === "sent") return mail.refs[0] ?? mail.inReplyTo ?? mail.messageId;

  const sender = mail.fromAddr.toLowerCase();
  // References は送り手がいくらでも並べられる。直前のメール(In-Reply-To と References の末尾)から MAX_REFS 件だけ見る
  const recent = [mail.inReplyTo, ...mail.refs.slice(-MAX_REFS)];
  const referenced = [...new Set(recent.filter((id): id is string => Boolean(id)))];
  if (!sender || referenced.length === 0) return mail.messageId;

  const candidates = db
    .prepare(
      `SELECT DISTINCT thread_key FROM messages
       WHERE account = ? AND thread_key IS NOT NULL AND message_id IN (${referenced.map(() => "?").join(", ")})`,
    )
    .all(account, ...referenced) as { thread_key: string }[];
  const participants = db.prepare("SELECT from_addr, to_text, cc_text FROM messages WHERE account = ? AND thread_key = ?");
  for (const { thread_key } of candidates) {
    const rows = participants.all(account, thread_key) as { from_addr: string; to_text: string; cc_text: string }[];
    if (rows.some((r) => addresses(`${r.from_addr} ${r.to_text} ${r.cc_text}`).includes(sender))) return thread_key;
  }
  return mail.messageId;
}
