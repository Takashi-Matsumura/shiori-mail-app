import "server-only";
import { ImapFlow } from "imapflow";
import type { Account } from "@/lib/accounts";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { parseRaw } from "@/lib/mail/parse";
import { recordProtocol } from "@/lib/mail/protocol-log";

export type MailboxSlug = "inbox" | "sent";
export const MAILBOXES: { slug: MailboxSlug; label: string }[] = [
  { slug: "inbox", label: "受信トレイ" },
  { slug: "sent", label: "送信済み" },
];

/** 初回同期で取り込む上限。実アカウントの大きなメールボックスを丸ごと落とさないため。 */
const INITIAL_LIMIT = 100;

type LogEntry = { src?: string; msg?: string; cid?: string; err?: unknown };

/** imapflow のログを通信ログへ流すロガー。認証行は imapflow 側でも伏せられる。 */
function protocolLogger(accountId: string) {
  const write = (entry: LogEntry) => {
    if (!entry || typeof entry.msg !== "string") return;
    const dir = entry.src === "c" ? "C" : entry.src === "s" ? "S" : "-";
    recordProtocol(accountId, "imap", entry.cid ?? "", dir, entry.msg);
  };
  return { trace: () => {}, debug: write, info: write, warn: write, error: write };
}

async function withImap<T>(account: Account, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: { user: account.user, pass: account.pass },
    logger: protocolLogger(account.id),
  });
  // 接続後の切断などで飛ぶ 'error' を拾わないとプロセスごと落ちる
  client.on("error", () => {});
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function resolvePath(client: ImapFlow, account: Account, slug: MailboxSlug): Promise<string> {
  if (slug === "inbox") return "INBOX";
  const boxes = await client.list();
  if (account.sentMailbox) {
    if (!boxes.some((b) => b.path === account.sentMailbox)) {
      // テストサーバには送信済みフォルダが無いので作る
      await client.mailboxCreate(account.sentMailbox);
    }
    return account.sentMailbox;
  }
  const sent = boxes.find((b) => b.specialUse === "\\Sent");
  if (!sent) throw new Error("送信済みフォルダが見つかりません。REAL_SENT_MAILBOX で指定してください。");
  return sent.path;
}

async function syncMailbox(client: ImapFlow, account: Account, slug: MailboxSlug): Promise<number> {
  const db = getDb();
  const path = await resolvePath(client, account, slug);
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = client.mailbox;
    if (!mailbox) return 0;

    // UIDVALIDITY が変わったら、サーバ側で UID が振り直されている。手元の控えは捨てて取り直す。
    const validityKey = `uidvalidity:${account.id}:${slug}`;
    const validity = String(mailbox.uidValidity);
    if (getSetting(validityKey) !== validity) {
      db.prepare("DELETE FROM messages WHERE account = ? AND mailbox = ?").run(account.id, slug);
      setSetting(validityKey, validity);
    }

    const local = db
      .prepare("SELECT uid FROM messages WHERE account = ? AND mailbox = ?")
      .all(account.id, slug) as { uid: number }[];
    const localUids = new Set(local.map((r) => r.uid));
    const maxUid = local.reduce((m, r) => Math.max(m, r.uid), 0);

    const serverUids = mailbox.exists ? ((await client.search({ all: true }, { uid: true })) || []) : [];
    const serverSet = new Set(serverUids);

    // サーバから消えたメールは手元からも消す
    const remove = db.prepare("DELETE FROM messages WHERE account = ? AND mailbox = ? AND uid = ?");
    for (const uid of localUids) if (!serverSet.has(uid)) remove.run(account.id, slug, uid);

    // 既読フラグは他のメーラーでも変わるので、手元にある分を取り直す
    const kept = [...localUids].filter((uid) => serverSet.has(uid));
    if (kept.length > 0) {
      const setSeen = db.prepare("UPDATE messages SET seen = ? WHERE account = ? AND mailbox = ? AND uid = ?");
      const flagRows: { uid: number; seen: number }[] = [];
      for await (const m of client.fetch(kept, { uid: true, flags: true }, { uid: true })) {
        flagRows.push({ uid: m.uid, seen: m.flags?.has("\\Seen") ? 1 : 0 });
      }
      for (const r of flagRows) setSeen.run(r.seen, account.id, slug, r.uid);
    }

    let fresh = serverUids.filter((uid) => uid > maxUid);
    if (maxUid === 0) fresh = fresh.slice(-INITIAL_LIMIT);
    if (fresh.length === 0) return 0;

    // source を要求すると imapflow は BODY.PEEK[] で取得するため、取り込みだけでは既読にならない
    const fetched = [];
    for await (const m of client.fetch(
      fresh,
      { uid: true, flags: true, source: true, bodyStructure: true, size: true, internalDate: true },
      { uid: true },
    )) {
      if (m.source) fetched.push(m);
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO messages
        (account, mailbox, uid, message_id, in_reply_to, refs, thread_key, subject, from_name, from_addr,
         to_text, cc_text, date, seen, text, html, raw, structure, has_attachments, size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const m of fetched) {
      const raw = m.source as Buffer;
      const p = await parseRaw(raw);
      const internal = m.internalDate ? new Date(m.internalDate) : new Date();
      // スレッドの根は References の先頭。無ければ In-Reply-To、それも無ければ自分自身。
      const threadKey = p.refs[0] ?? p.inReplyTo ?? p.messageId;
      insert.run(
        account.id,
        slug,
        m.uid,
        p.messageId,
        p.inReplyTo,
        JSON.stringify(p.refs),
        threadKey,
        p.subject,
        p.fromName,
        p.fromAddr,
        p.toText,
        p.ccText,
        (p.date ?? internal).getTime(),
        m.flags?.has("\\Seen") ? 1 : 0,
        p.text,
        p.html,
        raw,
        m.bodyStructure ? JSON.stringify(m.bodyStructure) : null,
        p.attachments.length > 0 ? 1 : 0,
        m.size ?? raw.length,
      );
    }
    return fetched.length;
  } finally {
    lock.release();
  }
}

/** 受信トレイと送信済みを同期し、新しく取り込んだ通数を返す。 */
export async function syncAccount(account: Account): Promise<number> {
  return withImap(account, async (client) => {
    let count = 0;
    for (const { slug } of MAILBOXES) count += await syncMailbox(client, account, slug);
    return count;
  });
}

/** \Seen フラグを付け外しする。既読・未読はサーバ上のフラグにすぎない。 */
export async function setSeenFlag(account: Account, slug: MailboxSlug, uid: number, seen: boolean): Promise<void> {
  await withImap(account, async (client) => {
    const lock = await client.getMailboxLock(await resolvePath(client, account, slug));
    try {
      if (seen) await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
      else await client.messageFlagsRemove([uid], ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
  getDb()
    .prepare("UPDATE messages SET seen = ? WHERE account = ? AND mailbox = ? AND uid = ?")
    .run(seen ? 1 : 0, account.id, slug, uid);
}

/** 送信したメールの控えを送信済みフォルダへ置く。SMTP は届けるだけで、控えの保存は IMAP の仕事。 */
export async function appendToSent(account: Account, raw: Buffer): Promise<void> {
  await withImap(account, async (client) => {
    const path = await resolvePath(client, account, "sent");
    await client.append(path, raw, ["\\Seen"]);
  });
}
