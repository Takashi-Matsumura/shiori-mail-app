"use client";

import { useActionState } from "react";
import { syncAction, type ActionState } from "@/app/actions";

export function SyncButton() {
  const [state, action, pending] = useActionState<ActionState>(syncAction, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <button
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
      >
        {pending ? "同期中…" : "サーバと同期"}
      </button>
      {state && !pending ? (
        <p role="status" className={`text-xs ${state.ok ? "text-muted" : "text-red-600"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
