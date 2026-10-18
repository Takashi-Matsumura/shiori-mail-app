import { isSameOrigin } from "@/lib/ai/stream";

/**
 * 利用者が画面を操作していることの知らせ(components/idle-lock.tsx が送る)。
 * セッションの確認と最終アクセスの更新は proxy.ts が済ませているので、ここでは何もしない。
 * セッションが切れていれば proxy が 401 を返し、画面はそれを見てロックする。
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  return new Response(null, { status: 204 });
}
