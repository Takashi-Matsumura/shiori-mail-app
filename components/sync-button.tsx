"use client";

import { useActionState } from "react";
import { syncAction, type ActionState } from "@/app/actions";
import { useNotices } from "@/lib/client/notices";

export function SyncButton() {
  const { notify } = useNotices();
  // 結果はボタンの下ではなく、画面上端のヘッダーに出す
  const [, action, pending] = useActionState<ActionState>(async () => {
    const result = await syncAction();
    if (result) notify({ source: "sync", kind: result.ok ? "info" : "error", text: `同期: ${result.message}` });
    return result;
  }, null);
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
      >
        {pending ? "同期中…" : "サーバと同期"}
      </button>
    </form>
  );
}
