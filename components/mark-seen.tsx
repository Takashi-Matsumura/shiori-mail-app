"use client";

import { useEffect, useRef } from "react";
import { setSeenAction } from "@/app/actions";

/**
 * 未読のメールを開いたら既読にする。画面には何も出さない。
 * 読み取り専用モードでは、サーバへは送らずアプリの中だけで記録する(lib/mail/imap.ts)。
 */
export function MarkSeen({ mailbox, uid, seen }: { mailbox: "inbox" | "sent"; uid: number; seen: boolean }) {
  // 開発時の二重実行や再描画で、同じメールに何度も送らないようにする
  const done = useRef(false);
  useEffect(() => {
    if (seen || done.current) return;
    done.current = true;
    setSeenAction(mailbox, uid, true).catch(() => {
      // 既読にできなくても読むのには困らないので、知らせずに次の機会に任せる
      done.current = false;
    });
  }, [mailbox, uid, seen]);
  return null;
}
