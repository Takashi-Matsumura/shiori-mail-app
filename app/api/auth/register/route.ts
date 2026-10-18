import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { passkeySite } from "@/lib/auth/http";
import { isValidInvite, registrationOptions, verifyRegistration } from "@/lib/auth/passkey";
import { isAuthenticated, setSessionCookie } from "@/lib/auth/session";

/**
 * パスキーの登録。登録できるのは次のどちらかのとき:
 * - ログイン中
 * - 招待(npm run auth:invite)を持っている。最初の 1 つも、外で使う端末の 1 つ目も、これで登録する。
 *   まだ 1 つも無いときに誰でも登録できると、この Mac の別のサービスを踏み台にされたとき、先に登録を取られてしまうため
 * body: { step: "options", invite? } → 登録用のオプション / { step: "verify", response, invite? } → 検証して保存
 */
export async function POST(request: Request) {
  const site = passkeySite(request);
  if (!site) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { step?: unknown; response?: unknown; invite?: unknown } | null;
  const invite = typeof body?.invite === "string" ? body.invite : undefined;

  const authenticated = await isAuthenticated();
  const invited = !authenticated && invite !== undefined;
  if (!authenticated && !(invited && isValidInvite(invite))) {
    return Response.json({ ok: false, message: "登録用のリンクが無効か、期限が切れています。" }, { status: 401 });
  }

  if (body?.step === "options") return Response.json(await registrationOptions(site));
  if (body?.step !== "verify" || !body.response) return new Response("Bad Request", { status: 400 });

  const ok = await verifyRegistration(body.response as RegistrationResponseJSON, site, invited ? invite : undefined).catch((e) => {
    console.error(e);
    return false;
  });
  if (!ok) return Response.json({ ok: false, message: "パスキーを登録できませんでした。もう一度お試しください。" }, { status: 400 });
  // ログインしていなかった登録(招待)は、そのままログインした扱いにする
  if (!authenticated) await setSessionCookie(site);
  return Response.json({ ok: true });
}
