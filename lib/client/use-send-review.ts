"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewResponse } from "@/lib/ai/prompts";
import { lockIfUnauthorized } from "@/lib/client/lock";

export type ReviewPayload = { to: string; cc: string; subject: string; text: string; replyTo?: number; attachments?: number };
export type ReviewState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ReviewResponse }
  | { status: "failed"; message: string };

/** 送信前の見直し(/api/ai/review)を頼む。内容が変わったら reset で結果を捨てる。 */
export function useSendReview() {
  const [state, setState] = useState<ReviewState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async (payload: ReviewPayload) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setState({ status: "running" });
    try {
      const res = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (lockIfUnauthorized(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as ReviewResponse;
      if (controller.current === ac) setState({ status: "done", result });
    } catch (e) {
      if (ac.signal.aborted) return;
      setState({ status: "failed", message: e instanceof Error ? `通信に失敗しました (${e.message})` : "通信に失敗しました" });
    }
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { state, start, reset };
}
