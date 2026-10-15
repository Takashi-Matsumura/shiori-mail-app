"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AquaButton } from "@/components/aqua-button";
import { SparkleIcon } from "@/components/icons";
import { useAiStream } from "@/lib/client/use-ai-stream";
import { seconds } from "@/lib/format";

/** 未処理のメールをまとめて AI にかけるボタン。1 通ごとの進み具合を表示する。 */
export function BatchButton({ kind, label, pending }: { kind: "classify" | "extract" | "embed"; label: string; pending: number }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { state, run, stop } = useAiStream(refresh);
  const p = state.progress;
  return (
    <div className="flex items-center gap-3">
      {state.running ? (
        <AquaButton type="button" tone="glass" size="sm" label="中止" onClick={stop}>
          <span aria-hidden="true" className="block size-3 animate-pulse rounded-[3px] bg-accent" />
        </AquaButton>
      ) : (
        <AquaButton
          type="button"
          tone="jelly"
          size="sm"
          label={pending === 0 ? `${label}(すべて処理済み)` : label}
          onClick={() => run("/api/ai/batch", { kind })}
          disabled={pending === 0}
        >
          <SparkleIcon />
        </AquaButton>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span aria-hidden="true" className={`font-medium ${pending === 0 && !state.running ? "text-muted" : "text-accent"}`}>
          {label}
        </span>
        {state.running && p ? (
          <p role="status" className="truncate text-xs text-muted">
            {p.done}/{p.total} {p.label} → {p.note}
          </p>
        ) : state.running ? (
          <p className="text-xs text-muted">栞が読んでいます…</p>
        ) : state.meta && p ? (
          <p className="text-xs text-muted">
            {p.done} 通を {seconds(state.meta.ms)}で処理(1 通あたり {seconds(state.meta.ms / Math.max(p.done, 1))})
          </p>
        ) : (
          <span className="text-xs text-muted">{pending > 0 ? `未処理 ${pending} 通` : "すべて処理済み"}</span>
        )}
        {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      </div>
    </div>
  );
}
