// パスキーを登録するための、使い捨ての招待を DB に書いてリンクを表示する。
// invite-passkey.mts(npm run auth:invite)と reset-passkeys.mts(npm run auth:reset)から使う。
// 有効なのは 10 分、1 回だけ。出し直すと前の招待は使えなくなる。照合は lib/auth/passkey.ts の isValidInvite
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const TTL_MS = 10 * 60_000;

/** アプリの DB を開く。アプリを一度も起動していない(DB が無い)なら、空の DB を作らずに案内して終わる */
export function openAppDb(): DatabaseSync {
  const file = path.join(process.cwd(), "data", "mailer.db");
  const db = existsSync(file) ? new DatabaseSync(file) : null;
  if (!db?.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()) {
    console.error("データがまだありません。先にアプリを一度起動(npm run dev など)してから実行してください。");
    process.exit(1);
  }
  return db;
}

export function issueInvite(db: DatabaseSync): void {
  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    "passkey_invite",
    `${hash}:${Date.now() + TTL_MS}`,
  );
  // この Mac で開くなら localhost、外の端末(iPhone など)なら公開ホスト。パスキーは開いている名前ごとに別物
  const port = process.env.PORT || "3000";
  const links = [`この Mac: http://localhost:${port}/login?invite=${token}`];
  const host = process.env.MAILER_PUBLIC_HOST?.trim().toLowerCase();
  if (host) links.push(`外の端末: https://${host}/login?invite=${token}`);
  console.log(
    [
      "次のリンクを、パスキーを登録したい端末で開いてください(10 分間・1 回だけ有効。出し直すと前のリンクは使えなくなります):",
      ...links,
      "3000 以外のポートで起動している場合は、PORT=<ポート> を付けて実行するか、localhost のリンクのポートを読み替えてください。",
    ].join("\n"),
  );
}
