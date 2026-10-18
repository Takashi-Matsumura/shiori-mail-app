// DB のスキーマ。lib/db.ts と、デモ用のデータを作るスクリプト(scripts/seed-demo.mts)の両方で使う。
// スクリプトからも読み込むので、server-only や "@/" の実体 import を持たせない。
import { KNN_MODEL_PREFIX } from "./ai/knn.ts";

export const SCHEMA = `
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

-- AI の応答がそのメールに限っておかしかった記録。一括処理はこれを見て読み飛ばし、1 通の失敗で残りが止まらないようにする
CREATE TABLE IF NOT EXISTS ai_failures (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL,
  last_tried INTEGER NOT NULL,
  PRIMARY KEY (message_id, kind)
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

-- 手元から消えたメール(ゴミ箱へ移した・ほかのメーラーで消したなど)の、仕分けの手本。
-- 近傍法(lib/ai/knn.ts)は「似たメールの仕分け」から推定するので、メールを消すと手本まで減ってしまう。
-- 本文は残さず、埋め込みベクトルと仕分けだけを残す。
-- 重なりの判定には、差出人が自由に決められる Message-ID ではなく、ベクトルそのものを使う
-- (偽の Message-ID を付けたメールで、ほかのメールの手本を消したり書き換えたりできないように)。message_key は記録用
DROP TRIGGER IF EXISTS keep_classify_example;
DROP TABLE IF EXISTS classify_examples;
CREATE TABLE IF NOT EXISTS kept_examples (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  message_key TEXT,
  model TEXT NOT NULL,
  vector BLOB NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  labeled INTEGER NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE (account, model, vector)
);

-- メールの行が消える直前に、手本を kept_examples へ写す(消える経路を問わず、ここ 1 か所で拾う)。
-- 答えは、あなたの確定を優先し、無ければ会話用モデルの判定(近傍法自身の推定は手本にしない)。
-- 同じベクトルの手本がすでにあれば、確定の手本を AI の判定で上書きしない
CREATE TRIGGER IF NOT EXISTS keep_example_on_delete BEFORE DELETE ON messages
WHEN OLD.mailbox = 'inbox'
BEGIN
  INSERT INTO kept_examples (account, message_key, model, vector, category, priority, labeled, created)
  SELECT OLD.account, OLD.message_id, e.model, e.vector,
         COALESCE(l.category, json_extract(a.result, '$.category')),
         COALESCE(l.priority, json_extract(a.result, '$.priority')),
         l.message_id IS NOT NULL,
         CAST(unixepoch('subsec') * 1000 AS INTEGER)
  FROM embeddings e
  LEFT JOIN classify_labels l ON l.message_id = OLD.id
  LEFT JOIN ai_results a ON a.message_id = OLD.id AND a.kind = 'classify' AND a.model NOT LIKE '${KNN_MODEL_PREFIX}%'
  WHERE e.message_id = OLD.id
    AND COALESCE(l.category, json_extract(a.result, '$.category')) IS NOT NULL
    AND COALESCE(l.priority, json_extract(a.result, '$.priority')) IS NOT NULL
  ON CONFLICT (account, model, vector) DO UPDATE SET
    message_key = excluded.message_key, category = excluded.category, priority = excluded.priority,
    labeled = excluded.labeled, created = excluded.created
  WHERE excluded.labeled >= kept_examples.labeled;
END;

-- 読み取り専用モードで付けた既読・未読。サーバへは送らず、同期でもこちらを優先する
CREATE TABLE IF NOT EXISTS local_seen (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  seen INTEGER NOT NULL
);

-- アプリを開くためのパスキー。公開鍵だけを持ち、秘密鍵は Mac(iCloud キーチェーン)から出ない
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  rp_id TEXT NOT NULL DEFAULT 'localhost',
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

-- 新着の通知(Web Push)の送り先。ホーム画面に追加した iPhone などが、設定画面で登録する
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
