"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BatchButton } from "@/components/batch-button";
import { CategoryBadge } from "@/components/category-badge";
import { CATEGORIES } from "@/lib/ai/prompts";

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
};

const PRIORITY_ORDER: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export function MessageList({ mailbox, title, items, pendingClassify }: {
  mailbox: string;
  title: string;
  items: Item[];
  pendingClassify: number;
}) {
  const params = useParams<{ uid?: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [byPriority, setByPriority] = useState(false);
  const classified = items.some((i) => i.category);

  let shown = category ? items.filter((i) => i.category === category) : items;
  if (byPriority) {
    // 元の新着順を保ったまま、優先度で安定ソートする
    shown = [...shown].sort((a, b) => (PRIORITY_ORDER[a.priority ?? ""] ?? 3) - (PRIORITY_ORDER[b.priority ?? ""] ?? 3));
  }

  return (
    <div className="flex w-96 shrink-0 flex-col border-r border-line bg-panel">
      <header className="flex flex-col gap-2 border-b border-line p-3">
        <h1 className="text-base font-semibold">
          {title} <span className="text-xs font-normal text-muted">{items.length} 通</span>
        </h1>
        {mailbox === "inbox" ? <BatchButton kind="classify" label="栞に仕分けてもらう" pending={pendingClassify} /> : null}
        {classified ? (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <Chip active={category === null} onClick={() => setCategory(null)}>
              すべて
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {c} {items.filter((i) => i.category === c).length}
              </Chip>
            ))}
            <label className="ml-auto flex items-center gap-1 text-muted">
              <input type="checkbox" checked={byPriority} onChange={(e) => setByPriority(e.target.checked)} />
              優先度順
            </label>
          </div>
        ) : null}
      </header>
      <ul className="flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <li className="p-4 text-muted">
            {items.length === 0 ? "メールがありません。左下の「サーバと同期」で取り込みます。" : "該当するメールがありません。"}
          </li>
        ) : null}
        {shown.map((m) => {
          const selected = params.uid === String(m.uid);
          return (
            <li key={m.uid}>
              <Link
                href={`/mail/${mailbox}/${m.uid}`}
                aria-current={selected ? "true" : undefined}
                className={`block border-b border-line px-3 py-2 ${selected ? "bg-accent-soft" : "hover:bg-background"}`}
              >
                <div className="flex items-baseline gap-2">
                  {!m.seen ? <span className="h-2 w-2 shrink-0 self-center rounded-full bg-accent" aria-label="未読" /> : null}
                  <span className={`min-w-0 flex-1 truncate ${m.seen ? "" : "font-semibold"}`}>{m.who}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{m.date}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`min-w-0 flex-1 truncate ${m.seen ? "" : "font-semibold"}`}>{m.subject}</span>
                  {m.threadSize > 1 ? <span className="shrink-0 rounded border border-line px-1 text-xs text-muted">{m.threadSize}</span> : null}
                  {m.hasAttachments ? <span className="shrink-0 text-xs text-muted">添付</span> : null}
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 ${active ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-background"}`}
    >
      {children}
    </button>
  );
}
