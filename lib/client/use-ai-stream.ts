"use client";

import { useCallback, useRef, useState } from "react";
import type { StreamEvent } from "@/lib/ai/stream";

export type StreamMeta = { ms: number; model?: string; promptTokens?: number | null; completionTokens?: number | null };

export type StreamState = {
  running: boolean;
  text: string;
  progress: { done: number; total: number; label: string; note: string } | null;
  meta: StreamMeta | null;
  error: string | null;
};

const IDLE: StreamState = { running: false, text: "", progress: null, meta: null, error: null };

/** NDJSON で進行状況を返す AI の API を呼び、届いた分から状態へ反映する。 */
export function useAiStream(onDone?: () => void) {
  const [state, setState] = useState<StreamState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (url: string, body: unknown, onDelta?: (text: string) => void) => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      setState({ ...IDLE, running: true });
      let failed = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line) as StreamEvent;
            if (e.t === "delta") {
              onDelta?.(e.v);
              setState((s) => ({ ...s, text: s.text + e.v }));
            } else if (e.t === "progress") {
              setState((s) => ({ ...s, progress: e }));
            } else if (e.t === "done") {
              setState((s) => ({ ...s, meta: e }));
            } else {
              failed = true;
              setState((s) => ({ ...s, error: e.message }));
            }
          }
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        failed = true;
        setState((s) => ({ ...s, error: e instanceof Error ? `通信に失敗しました (${e.message})` : "通信に失敗しました" }));
      } finally {
        if (controller.current === ac) setState((s) => ({ ...s, running: false }));
      }
      if (!failed) onDone?.();
    },
    [onDone],
  );

  const stop = useCallback(() => {
    controller.current?.abort();
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { state, run, stop };
}
