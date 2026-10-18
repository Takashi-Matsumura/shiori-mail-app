import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Site } from "@/lib/auth/site";
import { getDb, getSetting, setSetting } from "@/lib/db";

// パスキーは RP ID(開いている名前)ごとに別物。localhost と公開ホストの分を、passkeys.rp_id で分けて持つ。
// WebAuthn の RP ID には IP アドレスを使えないので、127.0.0.1 は proxy.ts が localhost へ移す
const RP_NAME = "Shiori Mail";
const CHALLENGE_TTL_MS = 5 * 60_000;

type Kind = "register" | "login";
type PasskeyRow = { id: string; public_key: Uint8Array; counter: number; transports: string | null };

/** その名前(RP ID)のパスキーが 1 つでもあるか */
export function hasPasskeys(rpId: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM passkeys WHERE rp_id = ? LIMIT 1").get(rpId));
}

function listPasskeys(rpId: string): PasskeyRow[] {
  return getDb()
    .prepare("SELECT id, public_key, counter, transports FROM passkeys WHERE rp_id = ?")
    .all(rpId) as PasskeyRow[];
}

const parseTransports = (t: string | null) => (t ? (JSON.parse(t) as string[]) : undefined);

function saveChallenge(challenge: string, kind: Kind): void {
  const db = getDb();
  db.prepare("DELETE FROM auth_challenges WHERE expires < ?").run(Date.now());
  db.prepare("INSERT INTO auth_challenges (challenge, kind, expires) VALUES (?, ?, ?)").run(
    challenge,
    kind,
    Date.now() + CHALLENGE_TTL_MS,
  );
}

/** チャレンジは一度きり。照合と同時に消すので、同じ応答を送り直されても通らない。 */
function consumeChallenge(challenge: string, kind: Kind): boolean {
  const res = getDb()
    .prepare("DELETE FROM auth_challenges WHERE challenge = ? AND kind = ? AND expires >= ?")
    .run(challenge, kind, Date.now());
  return res.changes === 1;
}

/** 利用者は 1 人だけなので、パスキーに結びつける利用者 ID は 1 つを使い回す */
function userId(): Uint8Array<ArrayBuffer> {
  let id = getSetting("passkey_user_id");
  if (!id) {
    id = randomBytes(16).toString("base64url");
    setSetting("passkey_user_id", id);
  }
  return new Uint8Array(Buffer.from(id, "base64url"));
}

export async function registrationOptions(site: Site) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: site.rpId,
    userName: "Shiori Mail",
    userID: userId(),
    excludeCredentials: listPasskeys(site.rpId).map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    // Touch ID などで本人確認できるものに限る
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
  });
  saveChallenge(options.challenge, "register");
  return options;
}

/**
 * invite は未ログインでの登録(招待)。検証が通ったときに使い切り、使えなければ保存しない
 * (使い切りは 1 つの DELETE なので、同じ招待で 2 つは登録できない)。
 */
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  site: Site,
  invite?: string,
): Promise<boolean> {
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, "register"),
    expectedOrigin: site.origin,
    expectedRPID: site.rpId,
    requireUserVerification: true,
  });
  if (!verified) return false;
  const { credential } = registrationInfo;
  const db = getDb();
  const res = db
    .prepare("INSERT OR IGNORE INTO passkeys (id, rp_id, public_key, counter, transports, created) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      credential.id,
      site.rpId,
      credential.publicKey,
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      Date.now(),
    );
  if (res.changes !== 1) return false;
  // 招待の使い切りは保存のあとに行う。先に使い切ると、保存に失敗したとき招待だけが消えて、やり直せなくなる。
  // 使い切れなかった(同時に別の登録が使った)ときは、いま保存した分を取り消す
  if (invite !== undefined && !consumeInvite(invite)) {
    db.prepare("DELETE FROM passkeys WHERE id = ?").run(credential.id);
    return false;
  }
  return true;
}

export async function authenticationOptions(site: Site) {
  const options = await generateAuthenticationOptions({
    rpID: site.rpId,
    allowCredentials: listPasskeys(site.rpId).map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    userVerification: "required",
  });
  saveChallenge(options.challenge, "login");
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON, site: Site): Promise<boolean> {
  const row = listPasskeys(site.rpId).find((p) => p.id === response.id);
  if (!row) return false;
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, "login"),
    expectedOrigin: site.origin,
    expectedRPID: site.rpId,
    credential: {
      id: row.id,
      publicKey: new Uint8Array(row.public_key),
      counter: row.counter,
      transports: parseTransports(row.transports),
    },
    requireUserVerification: true,
  });
  if (!verified) return false;
  getDb()
    .prepare("UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?")
    .run(authenticationInfo.newCounter, Date.now(), row.id);
  return true;
}

// 招待。外から使う端末のパスキーを、ログインせずに 1 つだけ登録できる使い捨ての合言葉。
// npm run auth:invite(この Mac のシェルを使える人だけ)が settings に「SHA-256:期限」で書く
const INVITE_KEY = "passkey_invite";
const inviteHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** 招待がまだ使えるか(消費はしない)。登録のオプションを返す前の確認に使う */
export function isValidInvite(token: string): boolean {
  const [hash, expires] = (getSetting(INVITE_KEY) ?? "").split(":");
  return Boolean(hash) && hash === inviteHash(token) && Number(expires) >= Date.now();
}

/** 招待を使い切る。照合と削除を 1 つの DELETE で行うので、同じ招待で 2 つは登録できない */
function consumeInvite(token: string): boolean {
  const current = getSetting(INVITE_KEY);
  if (!current || !isValidInvite(token)) return false;
  return getDb().prepare("DELETE FROM settings WHERE key = ? AND value = ?").run(INVITE_KEY, current).changes === 1;
}
