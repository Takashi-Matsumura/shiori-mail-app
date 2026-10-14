"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useState, useTransition } from "react";
import { clearClassificationLabelAction, labelClassificationAction } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { CategoryBadge } from "@/components/category-badge";
import { CATEGORIES, PRIORITIES, type Classification, type ExtractedItem } from "@/lib/ai/prompts";
import { useAiStream, type StreamMeta } from "@/lib/client/use-ai-stream";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

type Saved<T> = (T & { meta: StreamMeta }) | null;

type Props = {
  messageId: number;
  threadSize: number;
  summary: Saved<{ text: string }>;
  threadSummary: Saved<{ text: string }>;
  classification: Saved<{ value: Classification | null }>;
  /** 仕分けをあなたが確定済みか */
  classificationLabeled: boolean;
  extraction: Saved<{ items: ExtractedItem[] }>;
};

export function AiPanel({ messageId, threadSize, summary, threadSummary, classification, classificationLabeled, extraction }: Props) {
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
        <JsonTask
          title="仕分け"
          kind="classify"
          messageId={messageId}
          // 確定した仕分けは AI に上書きさせないので、やり直しのボタンも出さない
          meta={classificationLabeled ? null : (classification?.meta ?? null)}
          locked={classificationLabeled}
        >
          <ClassificationEditor
            key={`${classification?.value?.category}-${classification?.value?.priority}-${classificationLabeled}`}
            messageId={messageId}
            value={classification?.value ?? null}
            labeled={classificationLabeled}
          />
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
function JsonTask({ title, kind, messageId, meta, locked = false, children }: {
  title: string;
  kind: "classify" | "extract";
  messageId: number;
  meta: StreamMeta | null;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { state, run } = useAiStream(refresh);
  return (
    <Row
      title={title}
      action={
        locked ? null : (
          <button disabled={state.running} onClick={() => run("/api/ai/batch", { kind, id: messageId })} className={buttonClass}>
            {state.running ? "処理中…" : meta ? "やり直す" : "実行する"}
          </button>
        )
      }
    >
      {children}
      {!state.running && meta ? <AiMeta {...meta} /> : null}
      {state.error ? <p role="alert" className="text-red-600">{state.error}</p> : null}
    </Row>
  );
}

const selectClass = "rounded-md border border-line bg-panel px-1.5 py-1 text-xs focus:border-accent focus:outline-none";

/**
 * 仕分けの確定と修正。合っていればそのまま、違えば直してから確定する。
 * 確定した仕分けは正解として記録し、近傍法の教師データと、AI の正解率の測定に使う。
 */
function ClassificationEditor({ messageId, value, labeled }: { messageId: number; value: Classification | null; labeled: boolean }) {
  const [category, setCategory] = useState<string>(value?.category ?? "");
  const [priority, setPriority] = useState<string>(value?.priority ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fn: () => Promise<{ ok: boolean; message: string } | null>) =>
    start(async () => {
      const r = await fn();
      setError(r && !r.ok ? r.message : null);
    });

  if (labeled && value) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CategoryBadge category={value.category} />
        <span className="whitespace-nowrap">優先度 {value.priority}</span>
        <span className="rounded border border-accent px-1.5 text-xs text-accent">あなたが確定</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(() => clearClassificationLabelAction(messageId))}
          className="text-xs text-muted underline hover:text-foreground disabled:opacity-60"
        >
          確定を外す
        </button>
        {error ? <p role="alert" className="w-full text-red-600">{error}</p> : null}
      </div>
    );
  }

  const changed = !!value && (category !== value.category || priority !== value.priority);
  return (
    <div className="flex flex-col gap-1.5">
      {value ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <CategoryBadge category={value.category} />
          <span className="whitespace-nowrap">優先度 {value.priority}</span>
          <span className="text-muted">{value.reason}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="カテゴリ" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          {category === "" ? <option value="">カテゴリ</option> : null}
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select aria-label="優先度" value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
          {priority === "" ? <option value="">優先度</option> : null}
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>優先度 {p}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !category || !priority}
          onClick={() => submit(() => labelClassificationAction(messageId, category, priority))}
          className={buttonClass}
        >
          {pending ? "保存中…" : changed ? "直して確定" : "この内容で確定"}
        </button>
      </div>
      <p className="text-xs text-muted">確定した仕分けは AI に上書きされず、似たメールを仕分けるときの手本になります。</p>
      {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    </div>
  );
}
