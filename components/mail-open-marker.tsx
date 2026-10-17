"use client";

import { useParams } from "next/navigation";

/**
 * メールを開いている間だけ、目印(data-mail-open)を置く。lg 未満では、これの有無で一覧とメールの欄を切り替える
 * (app/(app)/mail/[mailbox]/layout.tsx)。
 * 目印をメールの画面の側に付けないのは、Next が離れた画面を display: none のまま DOM に残すため(戻っても目印が消えない)。
 */
export function MailOpenMarker() {
  const params = useParams<{ uid?: string }>();
  return params.uid ? <span data-mail-open hidden /> : null;
}
