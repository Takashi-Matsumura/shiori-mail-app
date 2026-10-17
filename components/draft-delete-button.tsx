"use client";

import { useTransition } from "react";
import { discardDraftAction } from "@/app/actions";
import { TrashIcon } from "@/components/icons";

/** 下書きの一覧から 1 つ消す。消したら一覧はサーバ側で描き直される */
export function DraftDeleteButton({ kind, subject }: { kind: string; subject: string }) {
  const [pending, start] = useTransition();
  const label = `下書き「${subject || "件名なし"}」を破棄`;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("この下書きを破棄しますか？元には戻せません。")) return;
        start(() => discardDraftAction(kind));
      }}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-panel hover:text-foreground disabled:opacity-50 [&_svg]:size-4"
    >
      <TrashIcon />
    </button>
  );
}
