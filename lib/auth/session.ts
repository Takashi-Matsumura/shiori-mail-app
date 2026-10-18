import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { siteFor, type Site } from "@/lib/auth/site";
import { getDb } from "@/lib/db";

/**
 * セッションの Cookie の名前。公開ホスト(HTTPS)では __Host- を付ける。この名前は Secure・Path=/・Domain なしの Cookie にしか
 * 使えないので、同じドメインの別のサイト(兄弟サブドメイン)が Domain=親ドメイン で同じ名前の Cookie を植えて、
 * ログインを妨げたり、別のセッションにすり替えたりできない。localhost は HTTP で Secure を付けられないので接頭辞なし
 */
export const sessionCookieName = (site: Site) => (site.secure ? "__Host-shiori_session" : "shiori_session");

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

/**
 * Cookie の値が有効なセッションか。touch を付けたときだけ最終アクセスを進める。
 * 進めるのは利用者の操作(画面を開く・操作の知らせ)だけ。自動同期や AI の処理のリクエストで進めると、
 * 画面を開いたまま放っておいたときにセッションが延び続け、無操作でのロックがサーバ側で効かなくなる。
 */
export function validateSession(token: string | undefined, { touch = false }: { touch?: boolean } = {}): boolean {
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
  if (touch && now - row.last_seen > TOUCH_MS) db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(now, key);
  return true;
}

export function deleteSession(token: string | undefined): void {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

/** セッションを作り、その入口の Cookie に入れる。secure は公開ホスト(HTTPS)で開いているとき。localhost は HTTP なので付けない */
export async function setSessionCookie(site: Site): Promise<void> {
  (await cookies()).set(sessionCookieName(site), createSession(), {
    httpOnly: true,
    secure: site.secure,
    // 他サイトから辿ってきたリクエストには付けない(CSRF よけ)
    sameSite: "strict",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const site = siteFor(await headers());
  return site ? validateSession((await cookies()).get(sessionCookieName(site))?.value) : false;
}

/**
 * Server Action の入口で呼ぶ。proxy.ts でも確かめているが、Server Action はどのページの URL へも送れるので、
 * 処理の手前でもう一度確かめる。
 */
export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}
