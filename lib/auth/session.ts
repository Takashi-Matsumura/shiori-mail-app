import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "shiori_session";

/** 操作が途切れてからロックするまで。画面を開いたままの場合は、画面側(IdleLock)が同じ時間でロックする。 */
export const IDLE_MS = 30 * 60_000;
/** 操作を続けていても、ログインからこの時間が経てば開き直してもらう */
const ABSOLUTE_MS = 12 * 60 * 60_000;
/** 最終アクセスの書き込みを間引く間隔。リクエストのたびに DB へ書かない */
const TOUCH_MS = 60_000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** セッションを作り、Cookie に入れる値を返す。DB にはその SHA-256 しか残さない。 */
export function createSession(): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const db = getDb();
  // 期限切れの残骸はここで掃除しておく
  db.prepare("DELETE FROM sessions WHERE last_seen < ? OR created < ?").run(now - IDLE_MS, now - ABSOLUTE_MS);
  db.prepare("INSERT INTO sessions (token_hash, created, last_seen) VALUES (?, ?, ?)").run(hash(token), now, now);
  return token;
}

/** Cookie の値が有効なセッションか。有効なら最終アクセスを進める。 */
export function validateSession(token: string | undefined): boolean {
  if (!token) return false;
  const db = getDb();
  const key = hash(token);
  const row = db.prepare("SELECT created, last_seen FROM sessions WHERE token_hash = ?").get(key) as
    | { created: number; last_seen: number }
    | undefined;
  if (!row) return false;
  const now = Date.now();
  if (now - row.last_seen > IDLE_MS || now - row.created > ABSOLUTE_MS) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(key);
    return false;
  }
  if (now - row.last_seen > TOUCH_MS) db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(now, key);
  return true;
}

export function deleteSession(token: string | undefined): void {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

/** secure は公開ホスト(HTTPS)で開いているとき。localhost は HTTP なので付けない */
export const sessionCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    secure,
    // 他サイトから辿ってきたリクエストには付けない(CSRF よけ)
    sameSite: "strict",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  }) as const;

export async function isAuthenticated(): Promise<boolean> {
  return validateSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Server Action の入口で呼ぶ。proxy.ts でも確かめているが、Server Action はどのページの URL へも送れるので、
 * 処理の手前でもう一度確かめる。
 */
export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}
