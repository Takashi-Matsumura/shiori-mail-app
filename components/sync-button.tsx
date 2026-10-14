"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNotices } from "@/lib/client/notices";
import { syncAndProcess } from "@/lib/client/sync-and-process";

/** 押すとサーバと同期し、そのまま新着を AI で処理する(自動処理を待たずに 1 回だけ回す)。 */
export function SyncButton() {
  const router = useRouter();
  const { notify } = useNotices();
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // 画面を離れたら、続きの AI 処理は止める
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    try {
      // 結果はボタンの下ではなく、画面上端のヘッダーに出す
      const result = await syncAndProcess({
        signal: ac.signal,
        report: ({ kind, text }) => notify({ source: "sync", kind, text: `同期と栞の処理: ${text}` }),
        onStepDone: () => router.refresh(),
      });
      if (result === "busy") notify({ source: "sync", kind: "info", text: "自動処理が動いている最中です。終わると新着も処理されます。" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <button
      type="button"
      disabled={running}
      onClick={run}
      title="サーバと同期し、そのまま新着を栞が読みます(索引 → 仕分け → 予定の抜き出し)"
      className="rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
    >
      {running ? "処理中…" : "サーバと同期"}
    </button>
  );
}
