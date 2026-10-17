import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { passkeySite } from "@/lib/auth/http";
import { hasPasskeys, isValidInvite, registrationOptions, verifyRegistration } from "@/lib/auth/passkey";
import { SESSION_COOKIE, createSession, isAuthenticated, sessionCookieOptions } from "@/lib/auth/session";

/**
 * パスキーの登録。登録できるのは次のどれかのとき:
 * - ログイン中
 * - 招待(npm run auth:invite)を持っている。公開ホストで使う端末は、これで最初の 1 つを登録する
 * - まだ 1 つも無く、localhost で開いている(初回)。公開ホストからの初回登録は受けない
 * body: { step: "options", invite? } → 登録用のオプション / { step: "verify", response, invite? } → 検証して保存
 */
export async function POST(request: Request) {
  const site = passkeySite(request);
  if (!site) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { step?: unknown; response?: unknown; invite?: unknown } | null;
  const invite = typeof body?.invite === "string" ? body.invite : undefined;

  const authenticated = await isAuthenticated();
  const first = !hasPasskeys() && site.rpId === "localhost";
  const invited = !authenticated && invite !== undefined;
  if (!authenticated && !first && !(invited && isValidInvite(invite))) {
    return Response.json({ ok: false, message: "登録用のリンクが無効か、期限が切れています。" }, { status: 401 });
  }

  if (body?.step === "options") return Response.json(await registrationOptions(site));
  if (body?.step !== "verify" || !body.response) return new Response("Bad Request", { status: 400 });

  const ok = await verifyRegistration(body.response as RegistrationResponseJSON, site, {
    firstOnly: !authenticated && !invited,
    invite: invited ? invite : undefined,
  }).catch((e) => {
    console.error(e);
    return false;
  });
  if (!ok) return Response.json({ ok: false, message: "パスキーを登録できませんでした。もう一度お試しください。" }, { status: 400 });
  // ログインしていなかった登録(初回・招待)は、そのままログインした扱いにする
  if (!authenticated) (await cookies()).set(SESSION_COOKIE, createSession(), sessionCookieOptions(site.secure));
  return Response.json({ ok: true });
}
