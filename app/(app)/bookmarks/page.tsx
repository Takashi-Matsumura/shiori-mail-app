import Link from "next/link";
import { Suspense } from "react";
import { InfoButton } from "@/components/info-button";
import { HELP } from "@/lib/help-texts";
import { requireAccount } from "@/lib/accounts";
import { shortDate } from "@/lib/format";
import { listBookmarks } from "@/lib/queries";

export default function BookmarksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold">
          読みかけ
          <InfoButton title="読みかけ" markdown={HELP.bookmarks} />
        </h1>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Bookmarks />
        </Suspense>
      </div>
    </div>
  );
}

async function Bookmarks() {
  const account = requireAccount();
  const items = await listBookmarks(account.id);
  if (items.length === 0) return <p className="text-muted">挟んだメールはありません。メールを開いて「挟む」を押すと、ここに並びます。</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((b) => (
        <li key={b.messageId}>
          <Link
            href={`/mail/${b.mailbox}/${b.uid}`}
            className="flex flex-col gap-1 rounded-xl border border-line bg-panel px-3.5 py-3 hover:border-accent/50"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{b.subject || "(件名なし)"}</span>
              {b.after > 0 ? (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 text-xs text-accent tabular-nums">その後 {b.after} 通</span>
              ) : null}
            </div>
            <p className={b.note ? "" : "text-muted"}>{b.note || "メモなし"}</p>
            <p className="flex gap-3 text-xs text-muted">
              <span className="min-w-0 truncate">{b.from}</span>
              <span className="shrink-0 tabular-nums">
                {b.lastActivity ? `最新 ${shortDate(b.lastActivity)}` : `${shortDate(b.created)} に挟んだ`}
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
