"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AquaButton } from "@/components/aqua-button";
import { SparkleIcon } from "@/components/icons";
import { useAiStream } from "@/lib/client/use-ai-stream";
import { seconds } from "@/lib/format";

/**
 * 未処理のメールをまとめて AI にかけるボタン。1 通ごとの進み具合を表示する。
 * compact は、ふだんは自動処理に任せていて状態を見せるのが主な場所(受信トレイの見出し)向けの、1 行の小さな表示。
 * 未処理があるときだけ押せて、すぐに処理を始められる。
 */
export function BatchButton({
  kind,
  label,
  pending,
  compact = false,
}: {
  kind: "classify" | "extract" | "embed";
  label: string;
  pending: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { state, run, stop } = useAiStream(refresh);
  const p = state.progress;
  if (compact) {
    const status = state.running
      ? p
        ? `${label}中 ${p.done}/${p.total}`
        : `${label}中…`
      : pending > 0
        ? `未処理 ${pending} 通`
        : `すべて${label}済み`;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={state.running ? stop : () => run("/api/ai/batch", { kind })}
          disabled={!state.running && pending === 0}
          aria-label={state.running ? `${label}を中止` : pending > 0 ? `未処理の ${pending} 通を、栞にいま${label}てもらう` : `すべて${label}済み`}
          title={state.running ? "中止" : pending > 0 ? `いま${label}る(自動同期を待たずに始めます)` : `すべて${label}済み(新着は自動同期で${label}ます)`}
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors [&_svg]:size-3.5 ${
            state.running
              ? "border-accent text-accent"
              : pending > 0
                ? "border-accent bg-accent-soft text-accent hover:bg-accent hover:text-panel"
                : "border-line text-muted disabled:opacity-60"
          }`}
        >
          {state.running ? <span aria-hidden="true" className="block size-2 animate-pulse rounded-[2px] bg-accent" /> : <SparkleIcon />}
        </button>
        <span role="status" className={`truncate ${pending > 0 || state.running ? "text-accent" : ""}`}>
          {status}
        </span>
        {state.error ? (
          <span role="alert" className="truncate text-red-600" title={state.error}>
            {state.error}
          </span>
        ) : null}
      </span>
    );
  }
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
