import Link from "next/link";
import { Suspense } from "react";
import { InfoButton } from "@/components/info-button";
import { HELP } from "@/lib/help-texts";
import { requireAccount } from "@/lib/accounts";
import { BookmarkList } from "@/components/bookmark-list";
import { countBookmarkTags, listBookmarks } from "@/lib/queries";

export default function BookmarksPage({ searchParams }: PageProps<"/bookmarks">) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold">
          読みかけ
          <InfoButton title="読みかけ" markdown={HELP.bookmarks} />
        </h1>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Bookmarks searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

const chipClass = "rounded-full border px-2.5 py-0.5 text-xs transition-colors";

async function Bookmarks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tag = typeof params.tag === "string" ? params.tag.slice(0, 40) : "";
  const account = requireAccount();
  const all = await listBookmarks(account.id);
  if (all.length === 0) return <p className="text-muted">挟んだメールはありません。メールを開いて「挟む」を押すと、ここに並びます。</p>;
  const items = tag ? all.filter((b) => b.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) : all;
  const tags = countBookmarkTags(all);
  return (
    <>
      {tags.length > 0 ? (
        <nav aria-label="キーワードで絞り込む" className="flex flex-wrap gap-1.5">
          <Link
            href="/bookmarks"
            aria-current={tag ? undefined : "page"}
            className={`${chipClass} ${tag ? "border-line text-muted hover:text-foreground" : "border-accent bg-accent text-panel"}`}
          >
            すべて {all.length}
          </Link>
          {tags.map((t) => {
            const current = t.tag.toLowerCase() === tag.toLowerCase();
            return (
              <Link
                key={t.tag}
                href={`/bookmarks?tag=${encodeURIComponent(t.tag)}`}
                aria-current={current ? "page" : undefined}
                className={`${chipClass} ${current ? "border-accent bg-accent text-panel" : "border-accent/50 text-accent hover:bg-accent-soft"}`}
              >
                #{t.tag} <span className="tabular-nums">{t.count}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
      {items.length === 0 ? <p className="text-muted">「#{tag}」の付いた読みかけはありません。</p> : <BookmarkList items={items} />}
    </>
  );
}
