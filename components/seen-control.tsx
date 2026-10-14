"use client";

import { useTransition } from "react";
import { setSeenAction } from "@/app/actions";

/**
 * 既読・未読の切替。開いただけでは既読にしない(サーバ上のフラグを、操作せずに書き換えないため)。
 * 読み取り専用モードでは、サーバへは送らずアプリの中だけで記録する(lib/mail/imap.ts)。
 */
export function SeenControl({ mailbox, uid, seen }: { mailbox: "inbox" | "sent"; uid: number; seen: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setSeenAction(mailbox, uid, !seen);
        })
      }
      className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
    >
      {seen ? "未読に戻す" : "既読にする"}
    </button>
  );
}
