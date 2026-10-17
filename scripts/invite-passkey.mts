// 外から使う端末(iPhone など)のパスキーを登録するための、使い捨ての招待リンクを出す。
// 公開ホスト(MAILER_PUBLIC_HOST)では初回でもログインせずに登録できないので、この Mac のシェルを使える人がこれで 1 つずつ許可する。
// 有効なのは 10 分、1 回だけ。出し直すと前の招待は使えなくなる。
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const TTL_MS = 10 * 60_000;
const host = process.env.MAILER_PUBLIC_HOST?.trim().toLowerCase();
if (!host) {
  console.error("MAILER_PUBLIC_HOST が設定されていません。.env.local に公開ホスト名を書いてから実行してください。");
  process.exit(1);
}

const token = randomBytes(24).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const db = new DatabaseSync(path.join(process.cwd(), "data", "mailer.db"));
db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
  "passkey_invite",
  `${hash}:${Date.now() + TTL_MS}`,
);
console.log(`次のリンクを登録したい端末で開いてください(10 分間・1 回だけ有効):\nhttps://${host}/login?invite=${token}`);
