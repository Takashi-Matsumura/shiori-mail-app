"use client";

import { useState, useTransition } from "react";
import { setDoneAction } from "@/app/actions";
import { AquaButton } from "@/components/aqua-button";
import { CheckIcon } from "@/components/icons";
import { useNotices } from "@/lib/client/notices";

/**
 * メールを「完了」にする/外すボタン。返信済みのメールは、押さなくても対応済みとして扱う。
 * 完了にすると、そのときの仕分けも確定する(サーバ側)。確定したことは画面上端のお知らせで伝える。
 */
export function DoneButton({ messageId, done, replied }: { messageId: number; done: boolean; replied: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotices();
  const label = done ? "完了を外す" : "完了にする";
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex h-13 items-center">
        <AquaButton
          type="button"
          tone={done ? "jelly" : "glass"}
          size="sm"
          label={label}
          aria-pressed={done}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setDoneAction(messageId, !done);
              setError(result?.ok ? null : (result?.message ?? "記録できませんでした"));
              if (result?.ok && !done) notify({ source: "done", kind: "info", text: result.message });
            })
          }
        >
          <CheckIcon />
        </AquaButton>
      </div>
      <span className={`text-[11px] ${done ? "text-accent" : "text-muted"}`}>
        {done ? "完了" : replied ? "返信済み" : "未対応"}
      </span>
      {error ? (
        <span role="alert" className="text-[11px] text-red-700 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
