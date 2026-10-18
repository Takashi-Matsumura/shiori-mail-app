import Link from "next/link";
import { shortDate } from "@/lib/format";
import type { BookmarkItem } from "@/lib/queries";

/** 読みかけの並び。読みかけの一覧と、検索画面で使う */
export function BookmarkList({ items }: { items: BookmarkItem[] }) {
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
            {b.tags.length > 0 ? (
              <p className="flex flex-wrap gap-x-2 text-xs text-accent">
                {b.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </p>
            ) : null}
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
