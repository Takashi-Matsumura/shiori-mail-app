import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT,
  in_reply_to TEXT,
  refs TEXT,
  thread_key TEXT,
  subject TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '',
  to_text TEXT NOT NULL DEFAULT '',
  cc_text TEXT NOT NULL DEFAULT '',
  date INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  html TEXT,
  raw BLOB NOT NULL,
  structure TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  UNIQUE (account, mailbox, uid)
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages (account, thread_key);

CREATE TABLE IF NOT EXISTS ai_results (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  result TEXT NOT NULL,
  ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created INTEGER NOT NULL,
  UNIQUE (message_id, kind)
);

CREATE TABLE IF NOT EXISTS embeddings (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  vector BLOB NOT NULL
);

-- 以前あった通信ログ。実メールの本文も記録していたので、残っていれば消す
DROP TABLE IF EXISTS protocol_log;

-- あなたが確定した仕分け(正解)。ai_* は確定した時点で AI が出していた判定で、AI の正解率を測るのに使う
CREATE TABLE IF NOT EXISTS classify_labels (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  ai_model TEXT,
  ai_category TEXT,
  ai_priority TEXT,
  created INTEGER NOT NULL
);

-- 読み取り専用モードで付けた既読・未読。サーバへは送らず、同期でもこちらを優先する
CREATE TABLE IF NOT EXISTS local_seen (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  seen INTEGER NOT NULL
);

-- アプリを開くためのパスキー。公開鍵だけを持ち、秘密鍵は Mac(iCloud キーチェーン)から出ない
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created INTEGER NOT NULL,
  last_used INTEGER
);

-- ログイン中のセッション。Cookie の値そのものではなく、その SHA-256 を持つ
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

-- パスキーの登録・認証で発行した、使い捨てのチャレンジ
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  expires INTEGER NOT NULL
);

-- あなたが「完了」にしたメール。同じスレッドでこれより前のメールも、まとめて対応済みとみなす
CREATE TABLE IF NOT EXISTS message_done (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  created INTEGER NOT NULL
);

-- 作成画面の書きかけ。kind は new / reply-<id> / forward-<id>。ログインの内側(サーバ)に置き、ロック中は読めないようにする
CREATE TABLE IF NOT EXISTS compose_drafts (
  kind TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  saved INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// dev の HMR でモジュールが再評価されても接続を1つに保つ
const globalForDb = globalThis as unknown as { __mailerDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__mailerDb) {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "mailer.db");
    const db = new DatabaseSync(file);
    // メールの本文が入るので、このマシンの他の利用者からは読めないようにする(既存のファイルにも掛け直す)
    chmodSync(dir, 0o700);
    chmodSync(file, 0o600);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    globalForDb.__mailerDb = db;
  }
  return globalForDb.__mailerDb;
}

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}
