// サーバの起動時に 1 回呼ばれる。本番サーバ(next start)でだけ、新着を通知するための裏の同期を始める。
// 開発サーバでは動かさない(本番と同じ DB を使うので、二重に同期・通知してしまう)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startBackgroundSync } = await import("@/lib/background-sync");
  startBackgroundSync();
}
