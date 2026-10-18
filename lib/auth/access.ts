import "server-only";
import { createPublicKey, verify, type KeyObject } from "node:crypto";

/**
 * 公開ホストへのリクエストが Cloudflare Access を通ってきたかを、Access が付ける JWT(Cf-Access-Jwt-Assertion)で確かめる。
 * Access の設定を誤ったり、Tunnel 以外の経路で届いたりしても、パスキーだけが残る状態にしないため。
 * 公開鍵は https://<チーム>.cloudflareaccess.com/cdn-cgi/access/certs から取り、しばらく使い回す。
 * 設定(MAILER_ACCESS_TEAM_DOMAIN・MAILER_ACCESS_AUD)が無いときは、公開ホストを通さない。
 */

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;
const AUD = /^[A-Za-z0-9_-]{16,128}$/;
const KEYS_TTL_MS = 60 * 60_000;
// 知らない kid が来たら鍵を取り直す(Cloudflare は鍵を入れ替える)。ただし取り直しは 1 分に 1 回まで
const REFETCH_MIN_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
// 時計のずれの許容(秒)
const SKEW_S = 60;

type AccessConfig = { teamDomain: string; aud: string };

let warned = false;

function accessConfig(): AccessConfig | null {
  const teamDomain = process.env.MAILER_ACCESS_TEAM_DOMAIN?.trim().toLowerCase() ?? "";
  const aud = process.env.MAILER_ACCESS_AUD?.trim() ?? "";
  if (TEAM_DOMAIN.test(teamDomain) && AUD.test(aud)) return { teamDomain, aud };
  if (!warned) {
    warned = true;
    console.error("MAILER_ACCESS_TEAM_DOMAIN / MAILER_ACCESS_AUD が未設定か不正なため、公開ホストへのリクエストはすべて断ります。docs/cloudflare.md を参照してください。");
  }
  return null;
}

type KeySet = { teamDomain: string; keys: Map<string, KeyObject>; fetched: number };
let keySet: KeySet | null = null;
let pending: Promise<KeySet | null> | null = null;

async function fetchKeys(teamDomain: string): Promise<KeySet | null> {
  try {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: unknown })[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
      } catch {}
    }
    return { teamDomain, keys, fetched: Date.now() };
  } catch (e) {
    console.error(`Cloudflare Access の公開鍵を取得できませんでした: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function keyFor(teamDomain: string, kid: string): Promise<KeyObject | null> {
  const now = Date.now();
  const current = keySet?.teamDomain === teamDomain ? keySet : null;
  const fresh = current && now - current.fetched < KEYS_TTL_MS;
  const found = current?.keys.get(kid);
  if (found && fresh) return found;
  // 期限切れか知らない kid。直前に取ったばかりなら取り直さない(でたらめな kid で Cloudflare を叩かせない)
  if (current && now - current.fetched < REFETCH_MIN_MS) return found ?? null;
  pending ??= fetchKeys(teamDomain).finally(() => (pending = null));
  const next = await pending;
  if (next) keySet = next;
  // 取り直しに失敗したら、期限切れでも手元の鍵で確かめる(Cloudflare の一時的な不調で締め出されないように)
  return (next ?? current)?.keys.get(kid) ?? null;
}

const decodeJson = (part: string): unknown => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/** JWT を確かめる。署名(RS256)・発行元・宛先(AUD)・期限がすべて合うときだけ true */
export async function verifyAccessJwt(token: string, config: AccessConfig, now = Date.now()): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  let header: { alg?: unknown; kid?: unknown };
  let claims: { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown };
  try {
    header = decodeJson(h) as typeof header;
    claims = decodeJson(p) as typeof claims;
  } catch {
    return false;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;

  const key = await keyFor(config.teamDomain, header.kid);
  if (!key || !verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) return false;

  const nowS = now / 1000;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.iss === `https://${config.teamDomain}` &&
    aud.includes(config.aud) &&
    typeof claims.exp === "number" &&
    claims.exp + SKEW_S > nowS &&
    (claims.nbf === undefined || (typeof claims.nbf === "number" && claims.nbf - SKEW_S <= nowS))
  );
}

/** このリクエストが Cloudflare Access を通ってきたか */
export async function passedAccess(headers: Headers): Promise<boolean> {
  const config = accessConfig();
  const token = headers.get("cf-access-jwt-assertion");
  if (!config || !token) return false;
  return verifyAccessJwt(token, config);
}
