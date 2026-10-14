"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncAction } from "@/app/actions";
import type { StreamEvent } from "@/lib/ai/stream";
import { useNotices } from "@/lib/client/notices";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

const INTERVAL_MS = 5 * 60_000;
// 開閉の保存値を読み終える前に走り出さないよう、最初の 1 回は少し待つ
const FIRST_DELAY_MS = 3_000;

// 仕分けは似たメールの埋め込みを使うので、索引づくりを先に済ませる
const STEPS = [
  { kind: "embed", label: "検索用の索引" },
  { kind: "classify", label: "仕分け" },
  { kind: "extract", label: "予定の抜き出し" },
] as const;

/** 未処理のメールを 1 種類ぶん AI にかける。失敗したらその文言を返す。 */
async function runBatch(kind: string, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<string | null> {
  const res = await fetch("/api/ai/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
    signal,
  });
  if (!res.ok || !res.body) return `HTTP ${res.status}`;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let error: string | null = null;
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
      if (e.t === "progress") onProgress(e.done, e.total);
      else if (e.t === "error") error = e.message;
    }
  }
  return error;
}

/**
 * 画面を開いている間、一定の間隔でサーバと同期し、新着を AI で処理する。
 * 複数のタブで開いていても、動くのは 1 つだけ(Web Locks)。
 */
export function AutoRunner() {
  const router = useRouter();
  const [enabled, setEnabled] = useStoredFlag("auto-run", true);
  const { notify, dismiss } = useNotices();

  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    let busy = false;
    // 進み具合と結果は、画面上端のヘッダーに出す
    const setStatus = ({ text, error }: { text: string; error: boolean }) =>
      notify({ source: "auto", kind: error ? "error" : "progress", text: `自動処理: ${text}` });

    const cycle = async () => {
      setStatus({ text: "同期中…", error: false });
      const sync = await syncAction();
      if (ac.signal.aborted) return;
      let failure = sync && !sync.ok ? sync.message : null;
      for (const step of STEPS) {
        const error = await runBatch(step.kind, ac.signal, (done, total) =>
          setStatus({ text: `${step.label} ${done}/${total}`, error: false }),
        );
        if (ac.signal.aborted) return;
        router.refresh();
        if (error) {
          // AI サーバが落ちているなら、残りの種類も同じ理由で失敗する
          failure ??= error;
          break;
        }
      }
      const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      if (failure) setStatus({ text: failure, error: true });
      else notify({ source: "auto", kind: "info", text: `自動処理: ${time} に確認済み` });
    };

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (navigator.locks) await navigator.locks.request("mailer-auto-run", { ifAvailable: true }, (lock) => (lock ? cycle() : undefined));
        else await cycle();
      } catch (e) {
        if (!ac.signal.aborted) setStatus({ text: e instanceof Error ? `自動処理に失敗しました (${e.message})` : "自動処理に失敗しました", error: true });
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
      <label className="flex items-center gap-1.5 whitespace-nowrap text-muted" title="画面を開いている間、5 分ごとにサーバと同期し、新着を AI で処理します">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        自動で同期・AI 処理
      </label>
    </div>
  );
}
