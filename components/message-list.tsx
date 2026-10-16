"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BatchButton } from "@/components/batch-button";
import { CategoryBadge } from "@/components/category-badge";
import { CheckIcon, PaperclipIcon } from "@/components/icons";
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
};

const PRIORITY_ORDER: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export function MessageList({ mailbox, title, items, pendingClassify }: {
  mailbox: string;
  title: string;
  items: Item[];
  pendingClassify: number;
}) {
  const params = useParams<{ uid?: string }>();
  const [hidden, toggleHidden] = useHiddenCategories();
  const [byPriority, setByPriority] = useState(false);
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
        <h1 className="text-lg font-semibold">
          {title} <span className="text-xs font-normal text-muted">{items.length} 通</span>
          {hiddenCount > 0 ? <span className="ml-1 text-xs font-normal text-muted">(うち {hiddenCount} 通を非表示)</span> : null}
        </h1>
        {mailbox === "inbox" ? <BatchButton kind="classify" label="栞に仕分けてもらう" pending={pendingClassify} /> : null}
        {classified ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="一覧に出す仕分け(押すと隠す)">
              {CATEGORIES.map((c) => (
                <Chip key={c} shown={!hidden.has(c)} onClick={() => toggleHidden(c)}>
                  {c} <span className="tabular-nums opacity-70">{items.filter((i) => i.category === c).length}</span>
                </Chip>
              ))}
            </div>
            <div className="text-xs text-muted">
              <Switch label="優先度の高い順に並べる" checked={byPriority} onChange={setByPriority} />
            </div>
          </div>
        ) : null}
        {/* 何かを隠しているときだけ出す(絞り込まずに受信トレイを丸ごと移せないように) */}
        {mailbox === "inbox" && hiddenCount > 0 ? <TrashShown items={shown} /> : null}
        {mailbox === "inbox" ? (
          <div className="text-xs text-muted">
            <Switch
              label={`返信済み・完了を隠す(${items.filter((i) => i.handled).length} 通)`}
              checked={hideHandled}
              onChange={setHideHandled}
            />
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
          return (
            <li key={m.uid}>
              <Link
                href={`/mail/${mailbox}/${m.uid}`}
                aria-current={selected ? "true" : undefined}
                className={`relative flex flex-col gap-0.5 rounded-xl border py-2.5 pl-5 pr-3 transition-colors ${
                  selected ? "border-accent bg-accent-soft" : "border-transparent hover:border-line hover:bg-background"
                }`}
              >
                {!m.seen ? (
                  <span className="absolute left-2 top-[1.05rem] size-2 rounded-full bg-accent" aria-label="未読" />
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
                  {m.category ? <CategoryBadge category={m.category} priority={m.priority} /> : null}
                </div>
                <p className="truncate text-xs text-muted">{m.snippet}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
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
