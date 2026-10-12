import "server-only";
import { getDb } from "@/lib/db";

export type Proto = "imap" | "smtp";
/** C: クライアント(このアプリ)→サーバ / S: サーバ→クライアント / -: 接続状態などの補足 */
export type Dir = "C" | "S" | "-";

const KEEP = 4000;

/**
 * 認証情報を含みうる行を伏せる。imapflow と nodemailer も自前で伏せるが、
 * 画面に出すログなので二重に守る。
 */
export function maskSecrets(line: string): string {
  return line
    .replace(/^(\S+ LOGIN \S+) .+$/i, "$1 ********")
    .replace(/^(\S+ AUTHENTICATE \S+) .+$/i, "$1 ********")
    .replace(/^(AUTH \S+) .+$/i, "$1 ********");
}

export function recordProtocol(account: string, proto: Proto, conn: string, dir: Dir, text: string): void {
  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO protocol_log (ts, account, proto, conn, dir, line) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const ts = Date.now();
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    insert.run(ts, account, proto, conn, dir, maskSecrets(line).slice(0, 2000));
  }
  db.prepare("DELETE FROM protocol_log WHERE id <= (SELECT MAX(id) FROM protocol_log) - ?").run(KEEP);
}
