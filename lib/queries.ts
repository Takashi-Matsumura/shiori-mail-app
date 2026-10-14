import "server-only";
import { io } from "next/cache";
import { USER_LABEL_MODEL } from "@/lib/ai/knn";
import { getDb } from "@/lib/db";
import type { MailboxSlug } from "@/lib/mail/imap";
import type { Classification, ExtractedItem } from "@/lib/ai/prompts";

// node:sqlite は同期ドライバなので、読み取りの前に io() を待って
// 「リクエスト時に読むデータ」であることを Next.js に伝える(Cache Components)。

export type MessageRow = {
  id: number;
  account: string;
  mailbox: MailboxSlug;
  uid: number;
  message_id: string | null;
  in_reply_to: string | null;
  refs: string | null;
  thread_key: string | null;
  subject: string;
  from_name: string;
  from_addr: string;
  to_text: string;
  cc_text: string;
  date: number;
  seen: number;
  text: string;
  html: string | null;
  raw: Uint8Array;
  structure: string | null;
  has_attachments: number;
  size: number;
};

export type ListItem = {
  id: number;
  uid: number;
  subject: string;
  from_name: string;
  from_addr: string;
  to_text: string;
  date: number;
  seen: number;
  has_attachments: number;
  snippet: string;
  thread_size: number;
  classification: Classification | null;
};

export type AiResultRow = {
  kind: string;
  model: string;
  result: string;
  ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created: number;
};

function parseJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export async function listMessages(account: string, mailbox: MailboxSlug): Promise<ListItem[]> {
  await io();
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.uid, m.subject, m.from_name, m.from_addr, m.to_text, m.date, m.seen, m.has_attachments,
              substr(m.text, 1, 140) AS snippet,
              (SELECT COUNT(*) FROM messages t WHERE t.account = m.account AND t.thread_key = m.thread_key) AS thread_size,
              (SELECT result FROM ai_results a WHERE a.message_id = m.id AND a.kind = 'classify') AS classification
       FROM messages m WHERE m.account = ? AND m.mailbox = ? ORDER BY m.date DESC`,
    )
    .all(account, mailbox) as (Omit<ListItem, "classification"> & { classification: string | null })[];
  return rows.map((r) => ({ ...r, classification: parseJson<Classification>(r.classification) }));
}

export async function getMessage(account: string, mailbox: MailboxSlug, uid: number): Promise<MessageRow | null> {
  await io();
  const row = getDb()
    .prepare("SELECT * FROM messages WHERE account = ? AND mailbox = ? AND uid = ?")
    .get(account, mailbox, uid) as MessageRow | undefined;
  return row ?? null;
}

export async function getMessageById(account: string, id: number): Promise<MessageRow | null> {
  await io();
  const row = getDb().prepare("SELECT * FROM messages WHERE account = ? AND id = ?").get(account, id) as
    | MessageRow
    | undefined;
  return row ?? null;
}

/** 同じスレッドのメールを、受信・送信済みをまたいで古い順に返す。 */
export async function getThread(account: string, threadKey: string | null): Promise<MessageRow[]> {
  await io();
  if (!threadKey) return [];
  return getDb()
    .prepare("SELECT * FROM messages WHERE account = ? AND thread_key = ? ORDER BY date ASC")
    .all(account, threadKey) as MessageRow[];
}

export async function getCounts(account: string): Promise<{ unread: number; total: number }> {
  await io();
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS total, COALESCE(SUM(seen = 0), 0) AS unread FROM messages WHERE account = ? AND mailbox = 'inbox'",
    )
    .get(account) as { total: number; unread: number };
  return row;
}

export async function getAiResults(messageId: number): Promise<Record<string, AiResultRow>> {
  await io();
  const rows = getDb()
    .prepare(
      "SELECT kind, model, result, ms, prompt_tokens, completion_tokens, created FROM ai_results WHERE message_id = ?",
    )
    .all(messageId) as AiResultRow[];
  return Object.fromEntries(rows.map((r) => [r.kind, r]));
}

export type TaskRow = {
  messageId: number;
  uid: number;
  mailbox: MailboxSlug;
  subject: string;
  from: string;
  item: ExtractedItem;
};

export async function listTasks(account: string): Promise<{ tasks: TaskRow[]; pending: number; done: number }> {
  await io();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id, m.uid, m.mailbox, m.subject, m.from_name, m.from_addr, a.result
       FROM ai_results a JOIN messages m ON m.id = a.message_id
       WHERE m.account = ? AND a.kind = 'extract'`,
    )
    .all(account) as { id: number; uid: number; mailbox: MailboxSlug; subject: string; from_name: string; from_addr: string; result: string }[];
  const tasks: TaskRow[] = [];
  for (const r of rows) {
    const parsed = parseJson<{ items: ExtractedItem[] }>(r.result);
    for (const item of parsed?.items ?? []) {
      tasks.push({ messageId: r.id, uid: r.uid, mailbox: r.mailbox, subject: r.subject, from: r.from_name || r.from_addr, item });
    }
  }
  // 日付があるものを早い順に、無いものは末尾へ
  tasks.sort((a, b) => (a.item.date || "9999").localeCompare(b.item.date || "9999"));
  const total = (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE account = ? AND mailbox = 'inbox'").get(account) as { n: number }).n;
  return { tasks, pending: total - rows.length, done: rows.length };
}

export type PendingCounts = { classify: number; extract: number; embed: number };

export async function getPendingCounts(account: string): Promise<PendingCounts> {
  await io();
  const db = getDb();
  const count = (sql: string, ...args: string[]) => (db.prepare(sql).get(account, ...args) as { n: number }).n;
  const missing = (kind: string) =>
    count(
      `SELECT COUNT(*) AS n FROM messages m WHERE m.account = ? AND m.mailbox = 'inbox'
       AND NOT EXISTS (SELECT 1 FROM ai_results a WHERE a.message_id = m.id AND a.kind = ?)`,
      kind,
    );
  return {
    classify: missing("classify"),
    extract: missing("extract"),
    embed: count(
      "SELECT COUNT(*) AS n FROM messages m WHERE m.account = ? AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.message_id = m.id)",
    ),
  };
}

export type SearchHit = {
  id: number;
  uid: number;
  mailbox: MailboxSlug;
  subject: string;
  from: string;
  date: number;
  snippet: string;
  score?: number;
};

export async function keywordSearch(account: string, query: string): Promise<SearchHit[]> {
  await io();
  // 空白区切りの語をすべて含むもの(LIKE の % と _ はエスケープする)
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 5);
  if (terms.length === 0) return [];
  const where = terms.map(() => "(m.subject LIKE ? ESCAPE '\\' OR m.text LIKE ? ESCAPE '\\' OR m.from_name LIKE ? ESCAPE '\\')").join(" AND ");
  const args = terms.flatMap((t) => {
    const p = `%${t.replace(/[\\%_]/g, "\\$&")}%`;
    return [p, p, p];
  });
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.uid, m.mailbox, m.subject, m.from_name, m.from_addr, m.date, substr(m.text, 1, 140) AS snippet
       FROM messages m WHERE m.account = ? AND ${where} ORDER BY m.date DESC LIMIT 20`,
    )
    .all(account, ...args) as { id: number; uid: number; mailbox: MailboxSlug; subject: string; from_name: string; from_addr: string; date: number; snippet: string }[];
  return rows.map((r) => ({ id: r.id, uid: r.uid, mailbox: r.mailbox, subject: r.subject, from: r.from_name || r.from_addr, date: r.date, snippet: r.snippet }));
}

export type AiRunStat = { kind: string; model: string; count: number; avgMs: number; totalMs: number; promptTokens: number; completionTokens: number };

export type AiStats = {
  /** 受信トレイの通数(仕分けと抜き出しの対象) */
  inbox: number;
  /** 全メールボックスの通数(埋め込みの対象) */
  all: number;
  /** 処理の種類とモデルごとの記録 */
  runs: AiRunStat[];
  embedded: number;
  embedModel: string;
  categories: Record<string, number>;
  priorities: Record<string, number>;
  items: Record<string, number>;
  /** AI に読ませた本文の文字数(1 通を何度処理しても 1 回分として数える) */
  chars: number;
};

/** 右パネル用に、AI の処理の記録をまとめて集計する。 */
export async function getAiStats(account: string): Promise<AiStats> {
  await io();
  const db = getDb();
  const one = <T>(sql: string) => db.prepare(sql).get(account) as T;
  const runs = db
    .prepare(
      `SELECT a.kind, a.model, COUNT(*) AS count, AVG(a.ms) AS avgMs, SUM(a.ms) AS totalMs,
              COALESCE(SUM(a.prompt_tokens), 0) AS promptTokens, COALESCE(SUM(a.completion_tokens), 0) AS completionTokens
       FROM ai_results a JOIN messages m ON m.id = a.message_id WHERE m.account = ? AND a.model != '${USER_LABEL_MODEL}' GROUP BY a.kind, a.model ORDER BY count DESC`,
    )
    .all(account) as AiRunStat[];
  const results = db
    .prepare(
      `SELECT a.kind, a.result FROM ai_results a JOIN messages m ON m.id = a.message_id
       WHERE m.account = ? AND m.mailbox = 'inbox' AND a.kind IN ('classify', 'extract')`,
    )
    .all(account) as { kind: string; result: string }[];
  const categories: Record<string, number> = {};
  const priorities: Record<string, number> = {};
  const items: Record<string, number> = {};
  const add = (bag: Record<string, number>, key: string | undefined) => {
    if (key) bag[key] = (bag[key] ?? 0) + 1;
  };
  for (const r of results) {
    if (r.kind === "classify") {
      const c = parseJson<Classification>(r.result);
      add(categories, c?.category);
      add(priorities, c?.priority);
    } else {
      for (const item of parseJson<{ items: ExtractedItem[] }>(r.result)?.items ?? []) add(items, item.type);
    }
  }
  const embed = one<{ n: number; model: string | null }>(
    "SELECT COUNT(*) AS n, MAX(e.model) AS model FROM embeddings e JOIN messages m ON m.id = e.message_id WHERE m.account = ?",
  );
  return {
    inbox: one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE account = ? AND mailbox = 'inbox'").n,
    all: one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE account = ?").n,
    runs,
    embedded: embed.n,
    embedModel: embed.model ?? "",
    categories,
    priorities,
    items,
    // プロンプトに入れる本文は先頭 6000 字まで(lib/ai/prompts.ts の BODY_LIMIT)
    chars: one<{ n: number }>(
      `SELECT COALESCE(SUM(MIN(LENGTH(m.text), 6000)), 0) AS n FROM messages m
       WHERE m.account = ? AND EXISTS (SELECT 1 FROM ai_results a WHERE a.message_id = m.id)`,
    ).n,
  };
}
