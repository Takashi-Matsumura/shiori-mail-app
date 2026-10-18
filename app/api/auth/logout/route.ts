import { cookies } from "next/headers";
import { isSameOrigin } from "@/lib/ai/stream";
import { deleteSession, sessionCookieName } from "@/lib/auth/session";
import { siteFor } from "@/lib/auth/site";

/** ロック。サーバ側のセッションを消すので、Cookie が残っていても使えなくなる。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const site = siteFor(request.headers);
  if (!site) return new Response("Forbidden", { status: 403 });
  const jar = await cookies();
  const name = sessionCookieName(site);
  deleteSession(jar.get(name)?.value);
  jar.delete(name);
  return new Response(null, { status: 204 });
}
