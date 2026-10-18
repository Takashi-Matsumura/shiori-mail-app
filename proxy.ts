import { NextResponse, type NextRequest } from "next/server";
import { passedAccess } from "@/lib/auth/access";
import { SESSION_COOKIE, validateSession } from "@/lib/auth/session";
import { siteFor } from "@/lib/auth/site";

// ログインしていなくても開ける入口。パスキーの API は、それぞれの中で登録の可否などを確かめる。
// /link はメールのリンクを開く前の確認ページ。メールの iframe から開くタブにはログインの Cookie が付かないので入口に含める(メールのデータは読まない)
const PUBLIC_PATHS = new Set(["/login", "/link", "/api/auth/login", "/api/auth/register", "/api/auth/logout"]);
// localhost と公開ホスト(MAILER_PUBLIC_HOST)以外の名前で届いたリクエストは断る。
// 悪意あるサイトの DNS リバインディングで、localhost のこのアプリを読まれないように
const LOOPBACK_ALIASES = new Set(["127.0.0.1", "[::1]"]);

export async function proxy(request: NextRequest) {
  // request.url は待ち受けアドレス(127.0.0.1)で組み立てられているので、ブラウザが開いている名前は Host ヘッダから取る
  const host = request.headers.get("host") ?? "";
  if (!URL.canParse(`http://${host}`)) return new NextResponse("Bad Request", { status: 400 });
  const site = siteFor(request.headers);
  if (!site) {
    const opened = new URL(`${request.nextUrl.protocol}//${host}`);
    if (!LOOPBACK_ALIASES.has(opened.hostname)) return new NextResponse("Forbidden", { status: 403 });
    // パスキー(WebAuthn)は IP アドレスでは使えないので、localhost へ移ってもらう
    if (request.method !== "GET" && request.method !== "HEAD") return new NextResponse("Forbidden", { status: 403 });
    opened.hostname = "localhost";
    const dest = new URL(request.nextUrl.pathname + request.nextUrl.search, opened).href;
    // Next は 127.0.0.1 と localhost を同じホストとみなし、proxy の転送(Location)をホスト名抜きの相対パスに書き換える。
    // それでは同じ URL へ転送し続けるので、移動先を書いた小さなページを返す
    const html = escapeHtml(dest);
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${html}"><a href="${html}">${html}</a>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // 公開ホストは Cloudflare Access を通ったものだけ。ログイン画面やパスキーの API も含め、Access の手前からは何も見せない
  if (site.rpId !== "localhost" && !(await passedAccess(request.headers))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    // Server Action はどのページの URL へも送れる。入口のページ経由でセッション無しに呼ばれないよう、ここで止める
    if (request.headers.has("next-action")) return new NextResponse("Unauthorized", { status: 401 });
    return NextResponse.next();
  }

  if (validateSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  // 画面の表示ならログイン画面へ。それ以外(API・Server Action・RSC の取得)は 401 で断る
  const isPageView = request.method === "GET" && request.headers.get("sec-fetch-dest") === "document";
  if (!isPageView) return new NextResponse("Unauthorized", { status: 401 });
  const login = new URL("/login", site.origin);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const config = {
  // ビルド済みの JS・CSS、アイコン、マニフェストは、メールの内容を含まないので素通しにする。
  // ホーム画面に追加するとき、ブラウザはマニフェストとアイコンをログインの Cookie を付けずに取りに来ることがある
  // 通知用の Service Worker(sw.js)も、メールの内容を含まない固定のファイル
  matcher: "/((?!_next/|icon\\.svg$|favicon\\.ico$|apple-icon\\.png$|manifest\\.webmanifest$|icons/|sw\\.js$).*)",
};
