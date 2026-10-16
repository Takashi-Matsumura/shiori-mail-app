import "server-only";
import { ImapFlow } from "imapflow";
import type { Account } from "@/lib/accounts";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { parseRaw } from "@/lib/mail/parse";

export type MailboxSlug = "inbox" | "sent";
export const MAILBOXES: { slug: MailboxSlug; label: string }[] = [
  { slug: "inbox", label: "受信トレイ" },
  { slug: "sent", label: "送信済み" },
];

/** 初回同期で取り込む上限。大きなメールボックスを丸ごと落とさないため。 */
const INITIAL_LIMIT = 100;

async function withImap<T>(
  account: Account,
  fn: (client: ImapFlow) => Promise<T>,
  options: { connectionTimeout?: number; greetingTimeout?: number } = {},
): Promise<T> {
  const client = new ImapFlow({
    ...options,
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    // STARTTLS を剥がされても、平文のままパスワードを送らない
    doSTARTTLS: account.imap.secure ? undefined : true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
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

/** ログインまで通るかだけを確かめる。設定画面で、待たされすぎないよう短めに打ち切る。 */
export async function verifyImap(account: Account): Promise<void> {
  await withImap(account, async () => {}, { connectionTimeout: 15_000, greetingTimeout: 15_000 });
}

async function resolvePath(client: ImapFlow, account: Account, slug: MailboxSlug): Promise<string> {
  if (slug === "inbox") return "INBOX";
  const boxes = await client.list();
  if (account.sentMailbox) {
    // 無くても作らない(読み取り専用モードでもサーバへ書き込まないため)
    if (!boxes.some((b) => b.path === account.sentMailbox)) {
      throw new Error(`送信済みフォルダ「${account.sentMailbox}」がサーバにありません。設定画面のフォルダ名を確認してください。`);
    }
    return account.sentMailbox;
  }
  const sent = boxes.find((b) => b.specialUse === "\\Sent");
  if (!sent) throw new Error("送信済みフォルダが見つかりません。設定画面の「送信済みフォルダ名」で指定してください。");
  return sent.path;
}

async function syncMailbox(client: ImapFlow, account: Account, slug: MailboxSlug): Promise<number> {
  const db = getDb();
  const path = await resolvePath(client, account, slug);
  // 読み取り専用なら EXAMINE で開く(SELECT と違い、\Recent などサーバ側の状態も変えない)
  const lock = await client.getMailboxLock(path, { readOnly: account.readOnly });
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
      // 読み取り専用モードでアプリの中だけ付けた既読・未読は、サーバの状態で上書きしない
      const setSeen = db.prepare(
        "UPDATE messages SET seen = ? WHERE account = ? AND mailbox = ? AND uid = ? AND id NOT IN (SELECT message_id FROM local_seen)",
      );
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
  if (account.readOnly) {
    // サーバへは送らず、アプリの中だけで覚えておく
    const db = getDb();
    const row = db.prepare("SELECT id FROM messages WHERE account = ? AND mailbox = ? AND uid = ?").get(account.id, slug, uid) as
      | { id: number }
      | undefined;
    if (!row) return;
    db.prepare("INSERT INTO local_seen (message_id, seen) VALUES (?, ?) ON CONFLICT (message_id) DO UPDATE SET seen = excluded.seen").run(
      row.id,
      seen ? 1 : 0,
    );
    db.prepare("UPDATE messages SET seen = ? WHERE id = ?").run(seen ? 1 : 0, row.id);
    return;
  }
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
  if (account.readOnly) throw new Error("読み取り専用モードではメールボックスへ書き込みません");
  await withImap(account, async (client) => {
    const path = await resolvePath(client, account, "sent");
    await client.append(path, raw, ["\\Seen"]);
  });
}

/** そのまま画面に出してよい、削除を止めた理由 */
export class TrashError extends Error {}

/**
 * メールをサーバのゴミ箱(\Trash)へ移し、手元の控えも消す。完全には消さないので、ゴミ箱から戻せる。
 * ゴミ箱が見つからないときは、取り返しのつかない削除(EXPUNGE)はせずに止める。
 */
export async function moveToTrash(account: Account, slug: MailboxSlug, uids: number[]): Promise<void> {
  if (account.readOnly) throw new TrashError("読み取り専用モードではメールを削除しません");
  if (uids.length === 0) return;
  await withImap(account, async (client) => {
    const trash = (await client.list()).find((b) => b.specialUse === "\\Trash");
    if (!trash) throw new TrashError("サーバにゴミ箱のフォルダが見つからないので、削除を止めました。");
    const lock = await client.getMailboxLock(await resolvePath(client, account, slug));
    try {
      const moved = await client.messageMove(uids, trash.path, { uid: true });
      if (!moved) throw new TrashError("ゴミ箱へ移せませんでした。");
    } finally {
      lock.release();
    }
  });
  const remove = getDb().prepare("DELETE FROM messages WHERE account = ? AND mailbox = ? AND uid = ?");
  for (const uid of uids) remove.run(account.id, slug, uid);
}
