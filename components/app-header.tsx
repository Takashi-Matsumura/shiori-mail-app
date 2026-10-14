"use client";

import { useNotices, type Notice } from "@/lib/client/notices";

/** 画面上端の帯。同期や自動処理など、画面のどこから起きたかに関わらず利用者に伝えたいことをここに出す。 */
export function AppHeader() {
  const { notices, dismiss } = useNotices();
  const errors = notices.filter((n) => n.kind === "error");
  const others = notices.filter((n) => n.kind !== "error");
  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <p className="shrink-0 font-semibold">学習用メーラー</p>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {/* 読み上げでは、エラーはすぐに、それ以外は区切りのよいところで伝える */}
        <div role="status" className="flex min-w-0 items-center gap-2">
          {others.map((n) => (
            <NoticeChip key={n.source} notice={n} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" className="flex min-w-0 items-center gap-2">
          {errors.map((n) => (
            <NoticeChip key={n.source} notice={n} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </header>
  );
}

function NoticeChip({ notice, onDismiss }: { notice: Notice; onDismiss: (source: string) => void }) {
  const tone =
    notice.kind === "error"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      : "border-line bg-background text-muted";
  return (
    <div className={`flex min-w-0 max-w-xl items-center gap-1.5 rounded-md border py-1 pl-2.5 pr-1 text-xs ${tone}`}>
      {notice.kind === "progress" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
      ) : null}
      <span className="truncate" title={notice.text}>
        {notice.text}
      </span>
      {notice.kind === "progress" ? (
        <span className="w-1" />
      ) : (
        <button
          type="button"
          onClick={() => onDismiss(notice.source)}
          aria-label="このお知らせを閉じる"
          title="閉じる"
          className="h-5 w-5 shrink-0 rounded leading-none opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
