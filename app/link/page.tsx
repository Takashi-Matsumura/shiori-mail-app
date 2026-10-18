import { Suspense } from "react";
import { InfoButton } from "@/components/info-button";
import { LinkCloseButton } from "@/components/link-close-button";
import { ShioriLogo } from "@/components/shiori-logo";
import { HELP } from "@/lib/help-texts";
import { checkLink, parseLink, registrableDomain, type LinkWarning } from "@/lib/mail/link-check";
import { isValidLinkSignature } from "@/lib/mail/link-sig";

/**
 * メールの中のリンクを開く前の確認ページ。本当の行き先とフィッシングの手がかりを見せ、「このサイトを開く」を押して初めて外へ移る。
 * メールの HTML は sandbox 付きの iframe で開いているので、そこから開いたタブにはログインの Cookie(SameSite=Strict)が付かない。
 * そのためこのページはログインなしで開けるようにし、メールのデータは読まない(行き先・表示の文字・差出人・迷惑かどうかは URL で受け取る)。
 * 差出人と迷惑かどうかには、メールの画面がサーバの署名(k)を付けている。誰でもこのページへのリンクを作れるので、署名の合うものだけを信じる。
 */
export default function LinkPage({ searchParams }: PageProps<"/link">) {
  return (
    <main className="flex flex-1 items-start justify-center overflow-y-auto p-6 sm:items-center">
      <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
        <LinkCheck searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const LEVEL_CLASS: Record<LinkWarning["level"], string> = {
  危険: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  注意: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  参考: "border-line bg-background text-muted",
};

async function LinkCheck({ searchParams }: Pick<PageProps<"/link">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const url = parseLink(one(params.u));
  const text = one(params.t).slice(0, 200);

  if (!url) {
    return (
      <Card>
        <p>このリンクは開けません(http / https 以外の行き先か、形が正しくありません)。</p>
        <div className="flex flex-wrap gap-3">
          <LinkCloseButton />
        </div>
      </Card>
    );
  }

  const host = url.hostname;
  const domain = registrableDomain(host);
  const sub = host.endsWith(domain) ? host.slice(0, host.length - domain.length) : "";
  // 差出人と迷惑の判定は、アプリが署名したものだけ信じる。署名が合わないリンクはメールの画面以外で作られたもの
  // (第三者が警告の出ない確認ページを装っている可能性がある)なので、差出人を使わずに強く警告する
  const sender = one(params.s).slice(0, 320);
  const spam = one(params.spam) === "1";
  const signed = isValidLinkSignature(sender, spam, one(params.k));
  const warnings = [
    ...(signed
      ? []
      : [
          {
            level: "危険",
            message: "このリンクは、Shiori Mail がメールの画面で作ったものではありません。差出人や迷惑の判定を確かめられないので、心当たりがなければ開かないでください。",
          } as const,
        ]),
    ...checkLink({ url, text, sender: signed ? sender : "", spam: signed && spam }),
  ];
  const danger = warnings.some((w) => w.level === "危険");

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted">行き先</p>
        {/* 組織を表す部分を太く大きく。偽サイトは前半(サブドメイン)に有名な名前を入れてくる */}
        <p className="text-lg break-all">
          <span className="text-muted">{sub}</span>
          <span className="font-bold">{host.endsWith(domain) ? domain : host}</span>
        </p>
        <p className="font-mono text-xs break-all text-muted">{url.href}</p>
      </div>
      {text ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted">メールに表示されていた文字</p>
          <p className="break-all">{text}</p>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {warnings.map((w, i) => (
            <li key={i} className={`flex gap-2 rounded-md border px-3 py-2 ${LEVEL_CLASS[w.level]}`}>
              <span className="shrink-0 font-semibold">{w.level}</span>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-line bg-background px-3 py-2 text-muted">
          目立った手がかりは見つかりませんでした。それでも、ログインやカード番号を求められたら、行き先が本物かを確かめてください。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* 危険の手がかりがあるときは、開くほうを目立たせない */}
        <a
          href={url.href}
          rel="noopener noreferrer"
          className={
            danger
              ? "rounded-md border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              : "rounded-md bg-accent px-4 py-2 font-medium text-panel hover:opacity-90"
          }
        >
          {danger ? "危険を承知で開く" : "このサイトを開く"}
        </a>
        <LinkCloseButton />
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-xl border border-line bg-panel p-6">
      <h1 className="flex items-center gap-2 font-semibold">
        <ShioriLogo size={22} />
        リンク先の確認
        <InfoButton title="リンク先の確認" markdown={HELP.links} />
      </h1>
      {children}
    </div>
  );
}
