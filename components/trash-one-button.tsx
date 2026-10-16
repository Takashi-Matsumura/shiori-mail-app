"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { trashOneAction } from "@/app/actions";
import { AquaButton } from "@/components/aqua-button";
import { TrashIcon } from "@/components/icons";
import { InfoDialog } from "@/components/info-button";
import { TRASH_ONE_HELP } from "@/lib/help-texts";

/**
 * 開いているメールを 1 通だけサーバのゴミ箱へ移すボタン。押すと確認のダイアログを出し、そこで押して初めて移す。
 * 移したら、メールを選んでいない受信トレイへ戻る(戻すのは trashOneAction がサーバ側で行う)。
 */
export function TrashOneButton({ uid }: { uid: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      // うまくいけば画面ごと移るので、戻ってくるのは失敗したときだけ
      const result = await trashOneAction(uid);
      setError(result?.message ?? "ゴミ箱へ移せませんでした");
    });

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <AquaButton
        type="button"
        tone="glass"
        size="md"
        label="ゴミ箱へ移す"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <TrashIcon />
      </AquaButton>
      <span className="text-[11px] text-muted">ゴミ箱へ</span>
      {open
        ? createPortal(
            <InfoDialog title="このメールをゴミ箱へ移しますか？" markdown={TRASH_ONE_HELP} onClose={() => setOpen(false)}>
              {error ? (
                <p role="alert" className="text-red-700 dark:text-red-300">
                  {error}
                </p>
              ) : null}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-full border border-line bg-panel px-3.5 py-1.5 hover:border-accent"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={pending}
                  className="rounded-full bg-red-700 px-3.5 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600"
                >
                  {pending ? "移しています…" : "ゴミ箱へ移す"}
                </button>
              </div>
            </InfoDialog>,
            document.body,
          )
        : null}
    </div>
  );
}
