/**
 * セッションがまだ有効かの確認(lib/client/lock.ts の checkSession が呼ぶ)。
 * 確認は proxy.ts が済ませる。切れていれば proxy が 401 を返し、ここには届かない。
 * GET なので proxy は最終アクセスを進めない(操作の知らせ /api/auth/activity とは違い、セッションを延ばさない)。
 */
export async function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
