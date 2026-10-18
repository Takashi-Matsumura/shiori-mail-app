"use client";

import { useState, useTransition } from "react";
import { setBookmarkAction } from "@/app/actions";
import { AquaButton } from "@/components/aqua-button";
import { BookmarkIcon } from "@/components/icons";

/**
 * メールを「挟む」(読みかけにする)/外すボタン。挟むと、メールの右に栞(狭い画面では上に帯)が出て、栞がメモとキーワードを書く(components/bookmark-frame.tsx)。
 */
export function BookmarkButton({ messageId, bookmarked }: { messageId: number; bookmarked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex h-13 items-center">
        <AquaButton
          type="button"
          tone={bookmarked ? "jelly" : "glass"}
          size="sm"
          label={bookmarked ? "読みかけから外す" : "挟む(読みかけにする)"}
          aria-pressed={bookmarked}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setBookmarkAction(messageId, !bookmarked);
              setError(result?.ok ? null : (result?.message ?? "記録できませんでした"));
            })
          }
        >
          <BookmarkIcon />
        </AquaButton>
      </div>
      <span className={`text-[11px] ${bookmarked ? "text-accent" : "text-muted"}`}>{bookmarked ? "読みかけ" : "挟む"}</span>
      {error ? (
        <span role="alert" className="text-[11px] text-red-700 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
