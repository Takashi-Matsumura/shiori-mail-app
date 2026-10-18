"use client";

import { useEffect, useState } from "react";
import { ShioriLogo } from "@/components/shiori-logo";
import type { LinkAssessment, LinkAssessmentResponse } from "@/lib/ai/prompts";

const VERDICT_CLASS: Record<LinkAssessment["verdict"], string> = {
  危険そう: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  気になる点あり: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  特に気になる点なし: "border-line bg-background text-foreground",
};

type State = { status: "loading" } | { status: "done"; assessment: LinkAssessment } | { status: "error"; message: string };

/**
 * リンクの確認ページに出す、栞の見立て。ページは先に出し、見立ては AI の答えが返ってから出す。
 * 開くかどうかのボタンの見た目は、機械的な手がかりだけで決める(栞の見立てで「安全そう」に見せない)。
 */
export function LinkAssessmentNote({ u, t, s, spam, k }: { u: string; t: string; s: string; spam: boolean; k: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/link/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u, t, s, spam, k }),
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as LinkAssessmentResponse;
        setState(data.assessment ? { status: "done", assessment: data.assessment } : { status: "error", message: data.error ?? "栞に聞けませんでした。" });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ status: "error", message: "栞に聞けませんでした。" });
      });
    return () => ac.abort();
  }, [u, t, s, spam, k]);

  return (
    <section aria-live="polite" className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-xs text-muted">
        <ShioriLogo size={14} />
        栞の見立て
      </p>
      {state.status === "loading" ? (
        <p className="rounded-md border border-line bg-background px-3 py-2 text-muted">栞がリンクを見ています…</p>
      ) : state.status === "error" ? (
        <p className="rounded-md border border-line bg-background px-3 py-2 text-muted">{state.message}</p>
      ) : (
        <div className={`flex flex-col gap-1 rounded-md border px-3 py-2 ${VERDICT_CLASS[state.assessment.verdict]}`}>
          <p>
            <span className="font-semibold">{state.assessment.verdict}</span>
            {state.assessment.reason ? <span>: {state.assessment.reason}</span> : null}
          </p>
          <p className="text-xs opacity-80">栞が URL と差出人から見立てたもので、安全の保証ではありません。リンク先の中身までは確かめていません。</p>
        </div>
      )}
    </section>
  );
}
