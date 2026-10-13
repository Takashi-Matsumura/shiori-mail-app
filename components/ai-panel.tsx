"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId } from "react";
import { AiMeta } from "@/components/ai-meta";
import { CategoryBadge } from "@/components/category-badge";
import type { Classification, ExtractedItem } from "@/lib/ai/prompts";
import { useAiStream, type StreamMeta } from "@/lib/client/use-ai-stream";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

type Saved<T> = (T & { meta: StreamMeta }) | null;

type Props = {
  messageId: number;
  threadSize: number;
  summary: Saved<{ text: string }>;
  threadSummary: Saved<{ text: string }>;
  classification: Saved<{ value: Classification | null }>;
  extraction: Saved<{ items: ExtractedItem[] }>;
};

export function AiPanel({ messageId, threadSize, summary, threadSummary, classification, extraction }: Props) {
  const id = useId();
  // 既定は畳んだ状態。開閉はブラウザに保存し、どのメールでも同じ状態にする
  const [collapsed, setCollapsed] = useStoredFlag("ai-panel:collapsed", true);
  const digest = [
    extraction ? `予定・締切 ${extraction.items.length} 件` : null,
    summary ? "要約あり" : null,
    threadSummary ? "スレッド要約あり" : null,
  ].filter(Boolean);
  return (
    <section className="flex flex-col rounded-lg border border-line bg-panel">
      <h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls={id}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-4 py-3 text-left hover:bg-background"
        >
          <span aria-hidden="true" className="w-3 text-xs text-muted">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="font-semibold">AI アシスト</span>
          {collapsed ? (
            <>
              {classification?.value ? (
                <CategoryBadge category={classification.value.category} priority={classification.value.priority} />
              ) : null}
              <span className="text-xs text-muted">{digest.length > 0 ? digest.join(" ・ ") : classification?.value ? "" : "まだ処理していません"}</span>
            </>
          ) : (
            <span className="text-xs text-muted">結果は参考情報です。本文で確かめてください。</span>
          )}
        </button>
      </h2>
      <div id={id} hidden={collapsed} className="flex flex-col gap-3 px-4 pb-4">
        <StreamedText title="要約" url="/api/ai/summarize" body={{ id: messageId, scope: "message" }} saved={summary} />
        {threadSize > 1 ? (
          <StreamedText
            title={`スレッド要約(${threadSize} 通)`}
            url="/api/ai/summarize"
            body={{ id: messageId, scope: "thread" }}
            saved={threadSummary}
          />
        ) : null}
        <JsonTask title="仕分け" kind="classify" messageId={messageId} meta={classification?.meta ?? null}>
          {classification?.value ? (
            <p className="flex flex-wrap items-center gap-x-2">
              <CategoryBadge category={classification.value.category} />
              <span className="whitespace-nowrap">優先度 {classification.value.priority}</span>
              <span className="text-muted">{classification.value.reason}</span>
            </p>
          ) : null}
        </JsonTask>
        <JsonTask title="予定・締切・やること" kind="extract" messageId={messageId} meta={extraction?.meta ?? null}>
          {extraction ? (
            extraction.items.length === 0 ? (
              <p className="text-muted">該当する項目はありませんでした。</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {extraction.items.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded border border-line px-1.5 text-xs">{item.type}</span>
                    <span className="font-medium">{item.title}</span>
                    <span className="tabular-nums">{[item.date, item.time].filter(Boolean).join(" ")}</span>
                    <span className="text-muted">{item.detail}</span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </JsonTask>
      </div>
    </section>
  );
}

function Row({ title, action, children }: { title: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-t border-line pt-3">
      <div className="flex flex-col items-start gap-1.5">
        <h3 className="font-medium">{title}</h3>
        {action}
      </div>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}

const buttonClass = "rounded-md border border-accent px-2.5 py-1 text-xs text-accent hover:bg-accent-soft disabled:opacity-60";

/** 文章を少しずつ受け取って表示する(要約)。 */
function StreamedText({ title, url, body, saved }: { title: string; url: string; body: unknown; saved: Saved<{ text: string }> }) {
  const { state, run, stop } = useAiStream();
  const live = state.running || state.text !== "";
  const text = live ? state.text : (saved?.text ?? "");
  const meta = live ? state.meta : (saved?.meta ?? null);
  return (
    <Row
      title={title}
      action={
        state.running ? (
          <button onClick={stop} className={buttonClass}>
            中止
          </button>
        ) : (
          <button onClick={() => run(url, body)} className={buttonClass}>
            {text ? "やり直す" : "要約する"}
          </button>
        )
      }
    >
      {text ? <p className="whitespace-pre-wrap leading-relaxed">{text}</p> : null}
      {state.running && !text ? <p className="text-muted">AI が読んでいます…</p> : null}
      {!state.running && meta ? <AiMeta {...meta} /> : null}
      {state.error ? <p role="alert" className="text-red-600">{state.error}</p> : null}
    </Row>
  );
}

/** 構造化された結果を返す処理(仕分け・抽出)。終わったらサーバの保存結果を読み直す。 */
function JsonTask({ title, kind, messageId, meta, children }: {
  title: string;
  kind: "classify" | "extract";
  messageId: number;
  meta: StreamMeta | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { state, run } = useAiStream(refresh);
  return (
    <Row
      title={title}
      action={
        <button disabled={state.running} onClick={() => run("/api/ai/batch", { kind, id: messageId })} className={buttonClass}>
          {state.running ? "処理中…" : meta ? "やり直す" : "実行する"}
        </button>
      }
    >
      {children}
      {!state.running && meta ? <AiMeta {...meta} /> : null}
      {state.error ? <p role="alert" className="text-red-600">{state.error}</p> : null}
    </Row>
  );
}
