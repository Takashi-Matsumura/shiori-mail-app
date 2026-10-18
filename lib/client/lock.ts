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
