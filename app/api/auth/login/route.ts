import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { passkeySite } from "@/lib/auth/http";
import { authenticationOptions, hasPasskeys, verifyAuthentication } from "@/lib/auth/passkey";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/lib/auth/session";

/** body: { step: "options" } → 認証用のオプション / { step: "verify", response } → 検証してセッションを発行 */
export async function POST(request: Request) {
  const site = passkeySite(request);
  if (!site) return new Response("Forbidden", { status: 403 });
  if (!hasPasskeys(site.rpId)) return Response.json({ ok: false, message: "パスキーが登録されていません。" }, { status: 409 });

  const body = (await request.json().catch(() => null)) as { step?: unknown; response?: unknown } | null;
  if (body?.step === "options") return Response.json(await authenticationOptions(site));
  if (body?.step !== "verify" || !body.response) return new Response("Bad Request", { status: 400 });

  const ok = await verifyAuthentication(body.response as AuthenticationResponseJSON, site).catch((e) => {
    console.error(e);
    return false;
  });
  if (!ok) return Response.json({ ok: false, message: "本人確認できませんでした。もう一度お試しください。" }, { status: 401 });
  (await cookies()).set(SESSION_COOKIE, createSession(), sessionCookieOptions(site.secure));
  return Response.json({ ok: true });
}
