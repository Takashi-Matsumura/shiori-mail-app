import "server-only";

/**
 * アプリを開ける名前。localhost(この Mac)と、外から入るための公開ホスト名(MAILER_PUBLIC_HOST)の 2 つだけ。
 * 公開ホストは Cloudflare Tunnel の先にあり、Cloudflare Access を通ったリクエストだけが届く前提。
 */
export type Site = {
  /** パスキーの RP ID。パスキーはこの名前ごとに別物になる */
  rpId: string;
  /** ブラウザが開いているオリジン。パスキーの検証で照合する */
  origin: string;
  /** Cookie に Secure を付けるか */
  secure: boolean;
};

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function publicHost(): string | null {
  const host = process.env.MAILER_PUBLIC_HOST?.trim().toLowerCase();
  return host && HOSTNAME.test(host) ? host : null;
}

/**
 * Host ヘッダ(ブラウザが開いている名前)から、どちらの入口かを決める。どちらでもなければ null。
 * request.url は待ち受けアドレス(127.0.0.1)で組み立てられているので使わない。
 */
export function siteFor(headers: Headers): Site | null {
  const host = headers.get("host") ?? "";
  if (!URL.canParse(`http://${host}`)) return null;
  const url = new URL(`http://${host}`);
  if (url.hostname === "localhost") return { rpId: "localhost", origin: url.origin, secure: false };
  const pub = publicHost();
  // 公開ホストは HTTPS の外側からだけ受ける(cloudflared が X-Forwarded-Proto を付ける)。ポート付きの名前は受けない
  if (pub && url.host === pub && headers.get("x-forwarded-proto") === "https") {
    return { rpId: pub, origin: `https://${pub}`, secure: true };
  }
  return null;
}
