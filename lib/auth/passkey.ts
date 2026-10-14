import "server-only";
import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb, getSetting, setSetting } from "@/lib/db";

// WebAuthn の RP ID には IP アドレスを使えないので、localhost で開く前提にする(proxy.ts が 127.0.0.1 から転送する)
export const RP_ID = "localhost";
const RP_NAME = "Shiori Mail";
const CHALLENGE_TTL_MS = 5 * 60_000;

type Kind = "register" | "login";
type PasskeyRow = { id: string; public_key: Uint8Array; counter: number; transports: string | null };

export function hasPasskeys(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM passkeys LIMIT 1").get());
}

function listPasskeys(): PasskeyRow[] {
  return getDb().prepare("SELECT id, public_key, counter, transports FROM passkeys").all() as PasskeyRow[];
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

export async function registrationOptions() {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: "Shiori Mail",
    userID: userId(),
    excludeCredentials: listPasskeys().map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    // Touch ID などで本人確認できるものに限る
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
  });
  saveChallenge(options.challenge, "register");
  return options;
}

/**
 * firstOnly は未ログインでの登録(初回)。検証を待つ間に別の登録が先に保存されることがあるので、
 * 「まだ 1 つも無いとき」の確認と保存を 1 つの INSERT で行い、すでにあれば保存しない。
 */
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  origin: string,
  { firstOnly }: { firstOnly: boolean },
): Promise<boolean> {
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, "register"),
    expectedOrigin: origin,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!verified) return false;
  const { credential } = registrationInfo;
  const res = getDb()
    .prepare(
      `INSERT INTO passkeys (id, public_key, counter, transports, created) SELECT ?, ?, ?, ?, ?
       WHERE ? = 0 OR NOT EXISTS (SELECT 1 FROM passkeys)`,
    )
    .run(
      credential.id,
      credential.publicKey,
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      Date.now(),
      firstOnly ? 1 : 0,
    );
  return res.changes === 1;
}

export async function authenticationOptions() {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: listPasskeys().map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    userVerification: "required",
  });
  saveChallenge(options.challenge, "login");
  return options;
}

export async function verifyAuthentication(response: AuthenticationResponseJSON, origin: string): Promise<boolean> {
  const row = listPasskeys().find((p) => p.id === response.id);
  if (!row) return false;
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, "login"),
    expectedOrigin: origin,
    expectedRPID: RP_ID,
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
