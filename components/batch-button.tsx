"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAiStream } from "@/lib/client/use-ai-stream";
import { seconds } from "@/lib/format";

/** 未処理のメールをまとめて AI にかけるボタン。1 通ごとの進み具合を表示する。 */
export function BatchButton({ kind, label, pending }: { kind: "classify" | "extract" | "embed"; label: string; pending: number }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { state, run, stop } = useAiStream(refresh);
  const p = state.progress;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {state.running ? (
          <button onClick={stop} className="rounded-md border border-line px-2.5 py-1 hover:bg-background">
            中止
          </button>
        ) : (
          <button
            onClick={() => run("/api/ai/batch", { kind })}
            disabled={pending === 0}
            className="rounded-md border border-accent px-2.5 py-1 text-accent hover:bg-accent-soft disabled:border-line disabled:text-muted"
          >
            {label}
          </button>
        )}
        <span className="text-xs text-muted">{pending > 0 ? `未処理 ${pending} 通` : "すべて処理済み"}</span>
      </div>
      {state.running && p ? (
        <p role="status" className="truncate text-xs text-muted">
          {p.done}/{p.total} {p.label} → {p.note}
        </p>
      ) : null}
      {state.running && !p ? <p className="text-xs text-muted">栞が読んでいます…</p> : null}
      {!state.running && state.meta && p ? (
        <p className="text-xs text-muted">
          {p.done} 通を {seconds(state.meta.ms)}で処理(1 通あたり {seconds(state.meta.ms / Math.max(p.done, 1))})
        </p>
      ) : null}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}
