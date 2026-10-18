import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { SenderAuth } from "@/lib/mail/sender-auth";

const SEPARATORS = /[\s<>,;"']+/;
const MAX_REFS = 50;

/**
 * メールアドレスを比べられる形にそろえる。小文字にし、`+タグ` を落とす。
 * Gmail はローカル部の `.` を無視し、googlemail.com も同じ受信箱なので、それもそろえる。
 * 利用者自身のアドレスを除くときに、表記を変えただけの偽装(me+x@、m.e@)をすり抜けさせないため
 */
export function normalizeAddress(address: string): string {
  const a = address.toLowerCase();
  const at = a.lastIndexOf("@");
  if (at <= 0) return a;
  let local = a.slice(0, at);
  let domain = a.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

/**
 * From・To・Cc の表示文字列から、メールアドレスだけを取り出してそろえる。
 * 区切り文字で分けてから `@` を含むものを選ぶ。`[^…]+@[^…]+` の正規表現は、`@` の無い長い語で 2 乗の時間がかかった
 */
function addresses(text: string): string[] {
  return text
    .split(SEPARATORS)
    .filter((t) => t.includes("@"))
    .map(normalizeAddress);
}

type Headers = { messageId: string | null; inReplyTo: string | null; refs: string[]; fromAddr: string; senderAuth: SenderAuth };

/** 手元のメールのどれかが、この値を Message-ID かスレッドとして使っているか */
function taken(db: DatabaseSync, account: string, key: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM messages WHERE account = ? AND (message_id = ? OR thread_key = ?) LIMIT 1").get(account, key, key));
}

/**
 * どのスレッドにも入れないメールの thread_key。ふつうは自分の Message-ID だが、Message-ID は送り手が自由に書けるので、
 * 既存のメールやスレッドと同じ値なら使わない(既存のスレッドの値を Message-ID に書いて紛れ込むのを防ぐ)
 */
function ownKey(db: DatabaseSync, account: string, mailbox: string, uid: number, preferred: string | null): string {
  for (const key of [preferred, `${mailbox}:${uid}`]) {
    if (key && !taken(db, account, key)) return key;
  }
  return `${mailbox}:${uid}:${randomUUID()}`;
}

/** そのメールを手元に持っていれば、そのメールのスレッド */
function storedThread(db: DatabaseSync, account: string, messageId: string): string | null {
  const row = db
    .prepare("SELECT thread_key FROM messages WHERE account = ? AND message_id = ? AND thread_key IS NOT NULL LIMIT 1")
    .get(account, messageId) as { thread_key: string } | undefined;
  return row?.thread_key ?? null;
}

/**
 * 取り込むメールのスレッド(thread_key)を決める。References・In-Reply-To・Message-ID は送り手が自由に書けるので、
 * 書かれた値をそのままスレッドの名前にはせず、手元のメールで裏付けが取れるときだけ既存のスレッドに入れる。
 *
 * 送信済み(自分が出したもの):
 * - 返信元(In-Reply-To)が手元にあれば、そのスレッド。返信元が References に別のスレッドを書いていても引きずられない
 * - 無ければ References の先頭(返信元を取り込んでいないやり取りも、送信済みどうしでまとめるため)。
 *   ただし、受信したメールを含むスレッドと同じ値なら使わない
 * 受信したメール: 次のすべてを満たすときだけ既存のスレッドに入れる
 * - 差出人が偽装されていそうでない(受信サーバの認証結果。lib/mail/sender-auth.ts)
 * - 参照しているメールが手元にある
 * - 差出人が、そのスレッドの From・To・Cc のどこかに出てくる(やり取りの参加者)。利用者自身のアドレスは数えない。
 *   数えると、From を利用者自身に偽装するだけで、どのスレッドの参加者にもなれてしまう(宛先には必ず利用者が入るため)
 * どれにも当たらなければ、そのメールだけのスレッドにする。
 */
export function threadKeyFor(db: DatabaseSync, account: string, mailbox: string, uid: number, mail: Headers, selfAddresses: string[] = []): string {
  if (mailbox === "sent") {
    const parent = mail.inReplyTo ? storedThread(db, account, mail.inReplyTo) : null;
    if (parent) return parent;
    const root = mail.refs[0] ?? mail.inReplyTo;
    const mixed = root
      ? db.prepare("SELECT 1 FROM messages WHERE account = ? AND thread_key = ? AND mailbox != 'sent' LIMIT 1").get(account, root)
      : undefined;
    return root && !mixed ? root : ownKey(db, account, mailbox, uid, mail.messageId);
  }

  const sender = normalizeAddress(mail.fromAddr);
  const self = new Set(selfAddresses.map(normalizeAddress));
  // References は送り手がいくらでも並べられる。直前のメール(In-Reply-To と References の末尾)から MAX_REFS 件だけ見る
  const recent = [mail.inReplyTo, ...mail.refs.slice(-MAX_REFS)];
  const referenced = [...new Set(recent.filter((id): id is string => Boolean(id)))];
  if (mail.senderAuth === "ok" && sender && !self.has(sender) && referenced.length > 0) {
    const candidates = db
      .prepare(
        `SELECT DISTINCT thread_key FROM messages
         WHERE account = ? AND thread_key IS NOT NULL AND message_id IN (${referenced.map(() => "?").join(", ")})`,
      )
      .all(account, ...referenced) as { thread_key: string }[];
    const participants = db.prepare("SELECT from_addr, to_text, cc_text FROM messages WHERE account = ? AND thread_key = ?");
    for (const { thread_key } of candidates) {
      const rows = participants.all(account, thread_key) as { from_addr: string; to_text: string; cc_text: string }[];
      if (rows.some((r) => addresses(`${r.from_addr} ${r.to_text} ${r.cc_text}`).some((a) => a === sender && !self.has(a)))) return thread_key;
    }
  }
  return ownKey(db, account, mailbox, uid, mail.messageId);
}
