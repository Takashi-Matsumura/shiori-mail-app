"use client";

import { useState, useTransition } from "react";
import { importOlderAction } from "@/app/actions";

/**
 * 一覧の最後に置く「古いメールを取り込む」。最初の同期では新しい 100 通しか取り込まないので、それより前のメールはここから足す。
 * 1 回に取り込むのは OLDER_BATCH(100)通。取り込んだメールも、栞が自動で仕分ける。
 */
export function ImportOlder({ mailbox, remaining, batch }: { mailbox: "inbox" | "sent"; remaining: number; batch: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (remaining === 0 && !message) return null;
  return (
    <div className="flex flex-col items-center gap-1.5 border-t border-line px-4 py-4 text-xs text-muted">
      {remaining > 0 ? (
        <>
          <p>これより古いメールが、サーバにあと {remaining} 通あります。</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await importOlderAction(mailbox);
                setMessage(r ? { ok: r.ok, text: r.message } : null);
              })
            }
            className="rounded-full border border-accent px-3 py-1 text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {pending ? "取り込み中…" : `古いメールを ${Math.min(batch, remaining)} 通取り込む`}
          </button>
        </>
      ) : null}
      {message ? (
        <p role="status" className={message.ok ? "" : "text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
