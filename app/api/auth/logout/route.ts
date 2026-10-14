import { cookies } from "next/headers";
import { isSameOrigin } from "@/lib/ai/stream";
import { SESSION_COOKIE, deleteSession } from "@/lib/auth/session";

/** ロック。サーバ側のセッションを消すので、Cookie が残っていても使えなくなる。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const jar = await cookies();
  deleteSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
