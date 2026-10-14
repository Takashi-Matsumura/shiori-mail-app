import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { passkeyOrigin } from "@/lib/auth/http";
import { hasPasskeys, registrationOptions, verifyRegistration } from "@/lib/auth/passkey";
import { SESSION_COOKIE, createSession, isAuthenticated, sessionCookieOptions } from "@/lib/auth/session";

/**
 * パスキーの登録。まだ 1 つも無いとき(初回)だけは誰でも登録でき、それ以降はログイン中に限る。
 * body: { step: "options" } → 登録用のオプション / { step: "verify", response } → 検証して保存
 */
export async function POST(request: Request) {
  const origin = passkeyOrigin(request);
  if (!origin) return new Response("Forbidden", { status: 403 });
  const authenticated = await isAuthenticated();
  if (hasPasskeys() && !authenticated) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { step?: unknown; response?: unknown } | null;
  if (body?.step === "options") return Response.json(await registrationOptions());
  if (body?.step !== "verify" || !body.response) return new Response("Bad Request", { status: 400 });

  const ok = await verifyRegistration(body.response as RegistrationResponseJSON, origin, { firstOnly: !authenticated }).catch((e) => {
    console.error(e);
    return false;
  });
  if (!ok) return Response.json({ ok: false, message: "パスキーを登録できませんでした。もう一度お試しください。" }, { status: 400 });
  // 初回の登録は、そのままログインした扱いにする
  if (!authenticated) (await cookies()).set(SESSION_COOKIE, createSession(), sessionCookieOptions);
  return Response.json({ ok: true });
}
