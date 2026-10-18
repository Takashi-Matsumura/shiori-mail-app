import "server-only";
import { ImapFlow } from "imapflow";
import type { Account } from "@/lib/accounts";
import { getDb, getSetting, setSetting } from "@/lib/db";
import { DEMO, DEMO_MESSAGE } from "@/lib/demo";
import { parseRaw } from "@/lib/mail/parse";
import { threadKeyFor } from "@/lib/mail/thread";

export type MailboxSlug = "inbox" | "sent";
export const MAILBOXES: { slug: MailboxSlug; label: string }[] = [
  { slug: "inbox", label: "受信トレイ" },
  { slug: "sent", label: "送信済み" },
];

/** 初回同期で取り込む上限。大きなメールボックスを丸ごと落とさないため。 */
const INITIAL_LIMIT = 100;
/** 「古いメールを取り込む」1 回で取り込む通数 */
export const OLDER_BATCH = 100;

/** 手元に取り込んでいない、手元の最も古いメールより前のメールが、サーバに何通あるか(同期のたびに数え直す) */
const olderKey = (account: Account, slug: MailboxSlug) => `older_remaining:${account.id}:${slug}`;

export function getOlderRemaining(account: Account, slug: MailboxSlug): number {
  return Number(getSetting(olderKey(account, slug)) ?? 0) || 0;
}

/** サーバの UID のうち、手元の最も古いメールより前のもの(古い順) */
function olderUids(serverUids: number[], localUids: Iterable<number>): number[] {
  let min = Infinity;
  for (const uid of localUids) min = Math.min(min, uid);
  return min === Infinity ? [] : serverUids.filter((uid) => uid < min).sort((a, b) => a - b);
}

async function withImap<T>(
  account: Account,
  fn: (client: ImapFlow) => Promise<T>,
  options: { connectionTimeout?: number; greetingTimeout?: number } = {},
): Promise<T> {
  if (DEMO) throw new Error(DEMO_MESSAGE);
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

    const count = await fetchAndStore(client, account, slug, fresh);
    // 取り込んだあとの手元の最も古いメールより前に、サーバに何通残っているか
    const after = db.prepare("SELECT uid FROM messages WHERE account = ? AND mailbox = ?").all(account.id, slug) as { uid: number }[];
    setSetting(olderKey(account, slug), String(olderUids(serverUids, after.map((r) => r.uid)).length));
    return count;
  } finally {
    lock.release();
  }
}

/** 指定した UID のメールをサーバから取り出して、手元に保存する。保存した通数を返す */
async function fetchAndStore(client: ImapFlow, account: Account, slug: MailboxSlug, uids: number[]): Promise<number> {
  if (uids.length === 0) return 0;
  const db = getDb();
  // source を要求すると imapflow は BODY.PEEK[] で取得するため、取り込みだけでは既読にならない
  const fetched = [];
  for await (const m of client.fetch(
    uids,
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
    // 日付はサーバが受け取った時刻(INTERNALDATE)。ヘッダの Date は送り手が自由に書けるので、
    // 過去の日付にして返信済み・完了の扱いを引き継がせる(lib/queries.ts の REPLIED_SQL・DONE_SQL)ことができてしまう
    const received = m.internalDate ? new Date(m.internalDate) : (p.date ?? new Date());
    const threadKey = threadKeyFor(db, account.id, slug, m.uid, p, [account.email]);
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
      received.getTime(),
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
}

/**
 * 手元の最も古いメールより前のメールを、新しいほうから OLDER_BATCH 通だけ取り込む。
 * 新着の同期とは別に、利用者が「古いメールを取り込む」を押したときだけ動く。
 */
export async function importOlder(account: Account, slug: MailboxSlug): Promise<{ imported: number; remaining: number }> {
  return withImap(account, async (client) => {
    const db = getDb();
    const path = await resolvePath(client, account, slug);
    const lock = await client.getMailboxLock(path, { readOnly: account.readOnly });
    try {
      const mailbox = client.mailbox;
      // UID が振り直されていたら、先にふつうの同期で取り直してもらう(ここで古い UID を混ぜない)
      if (!mailbox || getSetting(`uidvalidity:${account.id}:${slug}`) !== String(mailbox.uidValidity)) return { imported: 0, remaining: 0 };
      const serverUids = mailbox.exists ? ((await client.search({ all: true }, { uid: true })) || []) : [];
      const local = (db.prepare("SELECT uid FROM messages WHERE account = ? AND mailbox = ?").all(account.id, slug) as { uid: number }[]).map(
        (r) => r.uid,
      );
      const older = olderUids(serverUids, local);
      const batch = older.slice(-OLDER_BATCH);
      const imported = await fetchAndStore(client, account, slug, batch);
      const remaining = older.length - batch.length;
      setSetting(olderKey(account, slug), String(remaining));
      return { imported, remaining };
    } finally {
      lock.release();
    }
  });
}

/** 受信トレイと送信済みを同期し、新しく取り込んだ通数を返す。 */
export async function syncAccount(account: Account): Promise<number> {
  // デモ用のデータでは、自動同期も何もせずに終える(エラーにすると、自動処理が毎回失敗を知らせてしまう)
  if (DEMO) return 0;
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
    // MOVE が無いと imapflow は「コピー → \Deleted → EXPUNGE」で代用する。そのとき UIDPLUS も無いと、
    // 指定外のメール(別のメーラーで \Deleted を付けたもの)まで EXPUNGE で完全に消えるので、移さずに止める
    if (!client.capabilities.has("MOVE") && !client.capabilities.has("UIDPLUS")) {
      throw new TrashError("このメールサーバは、指定したメールだけを移す仕組み(MOVE / UIDPLUS)に対応していないので、削除を止めました。");
    }
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
