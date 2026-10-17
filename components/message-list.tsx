"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BatchButton } from "@/components/batch-button";
import { CategoryBadge } from "@/components/category-badge";
import { CheckIcon, PaperclipIcon, PriorityIcon, SparkleIcon } from "@/components/icons";
import { ImportOlder } from "@/components/import-older";
import { Switch } from "@/components/switch";
import { TrashShown } from "@/components/trash-shown";
import { CATEGORIES } from "@/lib/ai/prompts";
import { useHiddenCategories } from "@/lib/client/use-hidden-categories";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

type Item = {
  uid: number;
  subject: string;
  who: string;
  date: string;
  seen: boolean;
  hasAttachments: boolean;
  snippet: string;
  threadSize: number;
  category: string | null;
  priority: string | null;
  /** 返信済みか完了にしたもの */
  handled: "replied" | "done" | null;
  /** 栞が「やり取りは終わっていそう」と判断した理由(未対応のメールだけ) */
  closedHint: string | null;
};

const PRIORITY_ORDER: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export function MessageList({ mailbox, title, items, pendingClassify, olderRemaining, olderBatch }: {
  mailbox: "inbox" | "sent";
  title: string;
  items: Item[];
  pendingClassify: number;
  /** 手元の最も古いメールより前に、サーバに残っている通数 */
  olderRemaining: number;
  olderBatch: number;
}) {
  const params = useParams<{ uid?: string }>();
  const [hidden, toggleHidden] = useHiddenCategories();
  const [byPriority, setByPriority] = useState(false);
  // 「未対応のみ」。保存先の名前は、フッターの「返信済み・完了を隠す」だったころのまま(切り替えた状態を引き継ぐ)
  const [hideHandled, setHideHandled] = useStoredFlag("hide-handled", false);
  const classified = items.some((i) => i.category);

  // 隠すのは仕分け済みのものだけ。まだ仕分けていないメールは必ず見せる
  let shown = items.filter((i) => !i.category || !hidden.has(i.category));
  if (hideHandled) shown = shown.filter((i) => !i.handled);
  const hiddenCount = items.length - shown.length;
  if (byPriority) {
    // 元の新着順を保ったまま、優先度で安定ソートする
    shown = [...shown].sort((a, b) => (PRIORITY_ORDER[a.priority ?? ""] ?? 3) - (PRIORITY_ORDER[b.priority ?? ""] ?? 3));
  }

  return (
    <div className="flex w-96 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex flex-col gap-3 border-b border-line px-3.5 pb-3 pt-4">
        {/* 1 行目: 名前と通数、右端に「未対応のみ」。2 行目: 隠している通数と、仕分けの状態(小さく) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex min-w-0 items-baseline gap-2 text-lg font-semibold">
              <span className="truncate">{title}</span>
              <span className="shrink-0 text-xs font-normal whitespace-nowrap text-muted">{items.length} 通</span>
            </h1>
            {mailbox === "inbox" ? (
              <div className="shrink-0 text-xs text-muted">
                <Switch
                  label={`未対応のみ(${items.filter((i) => !i.handled).length})`}
                  checked={hideHandled}
                  onChange={setHideHandled}
                  title="返信済み・完了にしたメールを隠し、まだ対応していないメールだけを表示します"
                />
              </div>
            ) : null}
          </div>
          {mailbox === "inbox" || hiddenCount > 0 ? (
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              {hiddenCount > 0 ? <span className="shrink-0 whitespace-nowrap">{hiddenCount} 通を非表示</span> : null}
              {hiddenCount > 0 && mailbox === "inbox" ? <span aria-hidden="true">・</span> : null}
              {mailbox === "inbox" ? <BatchButton kind="classify" label="仕分け" pending={pendingClassify} compact /> : null}
            </div>
          ) : null}
        </div>
        {classified ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="一覧に出す仕分け(押すと隠す)">
              {CATEGORIES.map((c) => (
                <Chip key={c} shown={!hidden.has(c)} onClick={() => toggleHidden(c)}>
                  {c} <span className="tabular-nums opacity-70">{items.filter((i) => i.category === c).length}</span>
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </header>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <li className="p-4 text-muted">
            {items.length === 0 ? "メールがありません。左の「サーバと同期」で取り込みます。" : "表示するメールがありません。隠している仕分けは、上のボタンで戻せます。"}
          </li>
        ) : null}
        {shown.map((m) => {
          const selected = params.uid === String(m.uid);
          // 返信も完了もしていない受信メール。既読・未読よりも目に入るよう、行の左端に縦の帯を付ける
          const pending = mailbox === "inbox" && !m.handled;
          return (
            <li key={m.uid}>
              <Link
                href={`/mail/${mailbox}/${m.uid}`}
                aria-current={selected ? "true" : undefined}
                className={`relative flex flex-col gap-0.5 rounded-xl border py-2.5 pl-7 pr-3 transition-colors ${
                  selected ? "border-accent bg-accent-soft" : "border-transparent hover:border-line hover:bg-background"
                }`}
              >
                {pending ? (
                  <span className="absolute inset-y-2.5 left-1.5 w-1 rounded-full bg-accent" title="未対応(返信も完了もしていない)">
                    <span className="sr-only">未対応</span>
                  </span>
                ) : null}
                {!m.seen ? (
                  <span className="absolute left-[0.95rem] top-[1.05rem] size-2 rounded-full bg-accent" aria-label="未読" />
                ) : null}
                <div className="flex items-baseline gap-2">
                  <span className={`min-w-0 flex-1 truncate ${m.seen ? "text-muted" : "font-semibold"}`}>{m.who}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">{m.date}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`min-w-0 flex-1 truncate ${m.seen ? "" : "font-semibold"}`}>{m.subject}</span>
                  {m.threadSize > 1 ? (
                    <span className="shrink-0 rounded-full border border-line px-1.5 text-[11px] tabular-nums text-muted" title={`スレッド ${m.threadSize} 通`}>
                      {m.threadSize}
                    </span>
                  ) : null}
                  {m.hasAttachments ? (
                    <span className="shrink-0 text-muted [&_svg]:size-3.5" title="添付あり">
                      <PaperclipIcon />
                      <span className="sr-only">添付あり</span>
                    </span>
                  ) : null}
                  {m.handled ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line px-1.5 text-[11px] text-muted [&_svg]:size-3"
                      title={m.handled === "done" ? "完了にしたメール" : "このメールの後に返信を送っています"}
                    >
                      <CheckIcon />
                      {m.handled === "done" ? "完了" : "返信済み"}
                    </span>
                  ) : null}
                  {m.closedHint ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-accent px-1.5 text-[11px] text-accent [&_svg]:size-3"
                      title={`栞: ${m.closedHint}(よければメールを開いて「完了」にしてください)`}
                    >
                      <SparkleIcon />
                      終わっていそう
                    </span>
                  ) : null}
                  {m.category ? <CategoryBadge category={m.category} priority={m.priority} /> : null}
                </div>
                <p className="truncate text-xs text-muted">{m.snippet}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <ImportOlder mailbox={mailbox} remaining={olderRemaining} batch={olderBatch} />
      {/*
        たまにしか使わない操作は、上のフィルタ(仕分けのボタン)と取り違えないよう、下のフッターにアイコンだけで並べる。
        並べ替えの切り替えは左、取り返しのつかないゴミ箱は右端に離して置く
        (「未対応のみ」は表示を絞るものなので、上の見出しの横に置く)
      */}
      {mailbox === "inbox" ? (
        <footer className="flex items-center gap-1 border-t border-line px-2 py-1.5" aria-label="一覧の操作">
          {classified ? (
            <ToggleIcon label="優先度の高い順に並べる" pressed={byPriority} onClick={() => setByPriority(!byPriority)}>
              <PriorityIcon />
            </ToggleIcon>
          ) : null}
          <TrashShown items={shown} filtered={hiddenCount > 0} />
        </footer>
      ) : null}
    </div>
  );
}

/** フッターの切り替えボタン。名前はマウスを乗せたときと読み上げで伝え、オンの間は色を付ける */
function ToggleIcon({ label, pressed, onClick, children }: { label: string; pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={`${label}(${pressed ? "オン" : "オフ"})`}
      onClick={onClick}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        pressed ? "border-accent bg-accent-soft text-accent" : "border-transparent text-muted hover:border-line hover:bg-background hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** 押すたびに、その仕分けを一覧に出す/隠すを切り替える。隠しているときは取り消し線で薄く描く */
function Chip({ shown, onClick, children }: { shown: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={shown}
      title={shown ? "押すと一覧から隠す" : "押すと一覧に戻す"}
      type="button"
      className={`rounded-full border px-2.5 py-1 transition-colors ${
        shown
          ? "border-line bg-panel hover:border-accent hover:text-accent"
          : "border-dashed border-line bg-background text-muted line-through hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
