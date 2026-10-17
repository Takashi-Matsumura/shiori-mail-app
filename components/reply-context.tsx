"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ExtractedItem } from "@/lib/ai/prompts";
import { useAiStream } from "@/lib/client/use-ai-stream";

const buttonClass = "rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent-soft disabled:opacity-60";

/**
 * 返信を書くときに、元のメールの要点(要約と、予定・締切・やること)を横に出す。アシストのパネルを開かずに、返事に要ることを見ながら書ける。
 * まだ作っていなければ、ここから頼める。結果はアシストのパネルと同じ場所に保存する。
 */
export function ReplyContext({
  messageId,
  summary,
  items,
}: {
  messageId: number;
  summary: string | null;
  /** null は、まだ抜き出していない */
  items: ExtractedItem[] | null;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const summarize = useAiStream();
  const extract = useAiStream(refresh);
  const summaryText = summarize.state.running || summarize.state.text ? summarize.state.text : (summary ?? "");

  return (
    <section aria-label="元のメールの要点" className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5">
      <h2 className="font-medium">元のメールの要点</h2>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs text-muted">要約</h3>
          {summarize.state.running ? (
            <button type="button" onClick={summarize.stop} className={buttonClass}>
              中止
            </button>
          ) : summaryText ? null : (
            <button type="button" onClick={() => summarize.run("/api/ai/summarize", { id: messageId, scope: "message" })} className={buttonClass}>
              要約する
            </button>
          )}
        </div>
        {summaryText ? <p className="text-xs leading-relaxed whitespace-pre-wrap">{summaryText}</p> : null}
        {summarize.state.running && !summaryText ? <p className="text-xs text-muted">栞が読んでいます…</p> : null}
        {summarize.state.error ? <p role="alert" className="text-xs text-red-600">{summarize.state.error}</p> : null}
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs text-muted">予定・締切・やること</h3>
          {items === null ? (
            <button
              type="button"
              disabled={extract.state.running}
              onClick={() => extract.run("/api/ai/batch", { kind: "extract", id: messageId })}
              className={buttonClass}
            >
              {extract.state.running ? "抜き出し中…" : "抜き出す"}
            </button>
          ) : null}
        </div>
        {items === null ? null : items.length === 0 ? (
          <p className="text-xs text-muted">ありません</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {items.map((item, i) => (
              <li key={i} className="flex flex-col">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="rounded-full border border-line px-1.5 text-[10px]">{item.type}</span>
                  <span className="font-medium">{item.title}</span>
                  <span className="tabular-nums text-muted">{[item.date, item.time].filter(Boolean).join(" ")}</span>
                </span>
                {item.detail ? <span className="text-muted">{item.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {extract.state.error ? <p role="alert" className="text-xs text-red-600">{extract.state.error}</p> : null}
      </div>
      <p className="text-[11px] text-muted">栞の読み取りです。大事なところは元のメールで確かめてください。</p>
    </section>
  );
}
