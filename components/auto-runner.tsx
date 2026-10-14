"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useNotices } from "@/lib/client/notices";
import { syncAndProcess } from "@/lib/client/sync-and-process";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

const INTERVAL_MS = 5 * 60_000;
// 開閉の保存値を読み終える前に走り出さないよう、最初の 1 回は少し待つ
const FIRST_DELAY_MS = 3_000;

/** 画面を開いている間、一定の間隔でサーバと同期し、新着を AI で処理する。 */
export function AutoRunner() {
  const router = useRouter();
  const [enabled, setEnabled] = useStoredFlag("auto-run", true);
  const { notify, dismiss } = useNotices();

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        // 進み具合と結果は、画面上端のヘッダーに出す。「サーバと同期」ボタンの処理が動いていれば、今回は見送る
        await syncAndProcess({
          signal: ac.signal,
          report: ({ kind, text }) => notify({ source: "auto", kind, text: `自動処理: ${text}` }),
          onStepDone: () => router.refresh(),
        });
      } finally {
        busy = false;
      }
    };

    const first = setTimeout(tick, FIRST_DELAY_MS);
    const timer = setInterval(tick, INTERVAL_MS);
    return () => {
      ac.abort();
      clearTimeout(first);
      clearInterval(timer);
      // 止めたとき(アカウントの切り替えを含む)は、前の状態を残さない
      dismiss("auto");
    };
  }, [enabled, router, notify, dismiss]);

  return (
    <div className="text-xs">
      <label className="flex items-center gap-1.5 whitespace-nowrap text-muted" title="画面を開いている間、5 分ごとにサーバと同期し、新着を栞が読みます">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        自動で同期・栞の処理
      </label>
    </div>
  );
}
