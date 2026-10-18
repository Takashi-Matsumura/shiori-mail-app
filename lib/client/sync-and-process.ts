"use client";

import { syncAction } from "@/app/actions";
import type { StreamEvent } from "@/lib/ai/stream";
import { checkSession, lockIfUnauthorized } from "@/lib/client/lock";

// 仕分けは似たメールの埋め込みを使うので、索引づくりを先に済ませる。
// やり取りが終わっていそうかは、仕分け(要返信などか)を見て決めるので、仕分けのあとに置く
const STEPS = [
  { kind: "embed", label: "検索用の索引" },
  { kind: "classify", label: "仕分け" },
  { kind: "closure", label: "やり取りの確認" },
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
  if (lockIfUnauthorized(res.status)) return "セッションが切れたのでロックします";
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

export type CycleStatus = { kind: "progress" | "error" | "info"; text: string };

/**
 * サーバと同期し、続けて未処理のメールを AI にかける(索引 → 仕分け → 抽出)。
 * 自動処理と「サーバと同期」ボタンの両方から呼ぶ。複数のタブや呼び出し元が重なっても、動くのは 1 つだけ(Web Locks)。
 * すでに別の処理が動いていれば何もせず "busy" を返す。
 */
export async function syncAndProcess({ signal, report, onStepDone }: {
  signal: AbortSignal;
  report: (status: CycleStatus) => void;
  /** 1 種類終わるごとに呼ぶ(一覧の読み直しなど) */
  onStepDone: () => void;
}): Promise<"ran" | "busy"> {
  const cycle = async () => {
    report({ kind: "progress", text: "同期中…" });
    const sync = await syncAction();
    if (signal.aborted) return;
    let failure = sync && !sync.ok ? sync.message : null;
    const synced = sync?.ok ? sync.message : null;
    for (const step of STEPS) {
      const error = await runBatch(step.kind, signal, (done, total) => report({ kind: "progress", text: `${step.label} ${done}/${total}` }));
      if (signal.aborted) return;
      onStepDone();
      if (error) {
        // AI サーバが落ちているなら、残りの種類も同じ理由で失敗する
        failure ??= error;
        break;
      }
    }
    const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    if (failure) report({ kind: "error", text: failure });
    else report({ kind: "info", text: `${time} に完了${synced ? `(${synced})` : ""}` });
  };
  try {
    if (!navigator.locks) {
      await cycle();
      return "ran";
    }
    return await navigator.locks.request("mailer-auto-run", { ifAvailable: true }, async (lock) => {
      if (!lock) return "busy" as const;
      await cycle();
      return "ran" as const;
    });
  } catch (e) {
    if (signal.aborted) return "ran";
    report({ kind: "error", text: e instanceof Error ? `処理に失敗しました (${e.message})` : "処理に失敗しました" });
    // Server Action(syncAction)はセッションが切れていると 401 で失敗し、ここに例外として届く。
    // 失敗の理由がそれなら画面に残さずロックする(本番の再起動などで失敗したときは、セッションが有効なので何も起きない)
    void checkSession();
    return "ran";
  }
}
