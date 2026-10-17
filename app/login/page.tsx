import { io } from "next/cache";
import { headers } from "next/headers";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { ShioriLogo } from "@/components/shiori-logo";
import { hasPasskeys, isValidInvite } from "@/lib/auth/passkey";
import { siteFor } from "@/lib/auth/site";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-line bg-panel p-8">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <ShioriLogo size={28} />
          Shiori Mail
        </p>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Login searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await io();
  const { next, invite } = await searchParams;
  const site = siteFor(await headers());
  // proxy.ts が localhost と公開ホスト以外を断っているので、ここに来るのはそのどちらか
  if (!site) return null;
  const nextPath = safeNext(next);
  if (typeof invite === "string" && isValidInvite(invite)) return <LoginForm mode="register" invite={invite} next={nextPath} />;
  if (hasPasskeys(site.rpId)) return <LoginForm mode="login" next={nextPath} />;
  // 公開ホストでの最初の 1 つは、招待でしか登録できない
  if (site.rpId !== "localhost" || hasPasskeys()) {
    return (
      <p className="text-center text-muted">
        この入口で使うパスキーがまだありません。Mac で <code>npm run auth:invite</code> を実行し、表示されたリンクから登録してください。
      </p>
    );
  }
  return <LoginForm mode="register" next={nextPath} />;
}

/**
 * 戻り先は同じサイトのパスに限る。ブラウザは URL 中のタブや改行を読み飛ばすので("/\t/evil.example" は
 * "//evil.example" になる)、正規表現ではなく URL として解釈し、オリジンが変わらないものだけを通す。
 */
function safeNext(next: string | string[] | undefined): string {
  const fallback = "/mail/inbox";
  if (typeof next !== "string" || !next.startsWith("/") || /[\x00-\x1f\x7f\\]/.test(next)) return fallback;
  const base = "http://localhost";
  if (!URL.canParse(next, base)) return fallback;
  const url = new URL(next, base);
  return url.origin === base ? url.pathname + url.search + url.hash : fallback;
}
