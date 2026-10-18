/**
 * ロックしてログイン画面へ移る。サーバ側のセッションを消すので、次は Touch ID で開くことになる。
 * next を渡すと、開き直したあとにその画面へ戻る。
 */
export async function lockAndGoToLogin(next?: string) {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // メールの内容を抱えたクライアント側のキャッシュを捨てたいので、ルーターの遷移ではなく読み込み直す
  window.location.assign(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

/** 今の画面(パスとクエリ)。ロック後に開き直したとき、ここへ戻す */
export function currentPath() {
  return location.pathname + location.search;
}

/**
 * API の応答が 401(サーバ側でセッションが切れている)なら、その場でロックする。
 * 切れたあとも画面にメールが残り続けないように、API を呼ぶところはこれを通す。ロックしたら true
 */
export function lockIfUnauthorized(status: number): boolean {
  if (status !== 401) return false;
  void lockAndGoToLogin(currentPath());
  return true;
}

/**
 * セッションがまだ有効かをサーバに確かめ、切れていればロックする。最終アクセスは進めない。
 * 自動処理が失敗したときや、裏に回っていた画面が戻ってきたときに呼ぶ(iOS Safari は裏のタイマーを止めるので、
 * 画面側の無操作の時計だけでは、サーバ側の期限切れに気づけない)
 */
export async function checkSession(): Promise<void> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    lockIfUnauthorized(res.status);
  } catch {
    // 通信できないときは判断できないので、何もしない
  }
}
