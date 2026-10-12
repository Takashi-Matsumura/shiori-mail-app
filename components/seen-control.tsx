"use client";

import { useEffect, useRef, useTransition } from "react";
import { setSeenAction } from "@/app/actions";

/** 既読・未読の切替。autoMark なら、開いた時点で \Seen フラグを付ける。 */
export function SeenControl({ mailbox, uid, seen, autoMark }: {
  mailbox: "inbox" | "sent";
  uid: number;
  seen: boolean;
  autoMark: boolean;
}) {
  const [pending, start] = useTransition();
  const marked = useRef(false);

  useEffect(() => {
    if (!autoMark || seen || marked.current) return;
    marked.current = true;
    start(async () => {
      await setSeenAction(mailbox, uid, true);
    });
  }, [autoMark, seen, mailbox, uid]);

  return (
    <button
      disabled={pending}
      onClick={() => {
        // 手動で未読に戻した直後に、自動既読が付け直さないようにする
        marked.current = true;
        start(async () => {
          await setSeenAction(mailbox, uid, !seen);
        });
      }}
      className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
    >
      {seen ? "未読に戻す" : "既読にする"}
    </button>
  );
}
