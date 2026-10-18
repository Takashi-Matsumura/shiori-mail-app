import { connection } from "next/server";

/**
 * セッションがまだ有効かの確認(lib/client/lock.ts の checkSession が呼ぶ)。
 * 確認は proxy.ts が済ませる。切れていれば proxy が 401 を返し、ここには届かない。
 * GET なので proxy は最終アクセスを進めない(操作の知らせ /api/auth/activity とは違い、セッションを延ばさない)。
 * connection() で「リクエストごとに動く」と宣言する。これが無いと next build が静的な応答として事前生成しようとし、失敗する
 */
export async function GET() {
  await connection();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
