"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, DraftIcon, InboxIcon, MoreIcon, PlusIcon, SearchIcon, SentIcon, SettingsIcon, TasksIcon } from "@/components/icons";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

// 「メニュー」にしまう行き先。どれかを開いている間は「メニュー」のタブを選択中として描く
const MORE_LINKS = [
  { href: "/mail/sent", label: "送信済み", icon: <SentIcon /> },
  { href: "/drafts", label: "下書き", icon: <DraftIcon /> },
  { href: "/settings", label: "設定", icon: <SettingsIcon /> },
];

/**
 * スマホ幅(md 未満)で左パネルの代わりに出す、画面下のタブ。
 * よく使う受信・検索・作成・予定はタブに並べ、残りの行き先と同期・栞の働きは「メニュー」のシートにしまう。
 * シートの中身(同期ボタンや栞の働き)はサーバ側で描いたものを children で受け取る。
 */
export function MobileTabBar({ unread, drafts, children }: { unread: number; drafts: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_LINKS.some((l) => isActive(pathname, l.href));
  return (
    <>
      <nav
        aria-label="メニュー"
        className="flex shrink-0 items-stretch justify-around border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Tab href="/mail/inbox" label="受信" icon={<InboxIcon />} active={isActive(pathname, "/mail/inbox")} badge={unread} badgeText={`未読 ${unread} 通`} />
        <Tab href="/search" label="検索" icon={<SearchIcon />} active={isActive(pathname, "/search")} />
        <Link
          href="/compose"
          aria-label="新規作成"
          className="my-1.5 flex w-14 items-center justify-center rounded-xl bg-accent text-panel active:opacity-80"
        >
          <PlusIcon />
        </Link>
        <Tab href="/tasks" label="予定" icon={<TasksIcon />} active={isActive(pathname, "/tasks")} />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={`flex min-w-16 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] ${moreActive ? "font-medium text-accent" : "text-muted"}`}
        >
          <MoreIcon />
          メニュー
        </button>
      </nav>
      {/* 閉じている間も外さない。中の同期ボタンは、外すと続きの AI 処理を止めてしまう */}
      <MoreSheet open={moreOpen} pathname={pathname} drafts={drafts} onClose={() => setMoreOpen(false)}>
        {children}
      </MoreSheet>
    </>
  );
}

function Tab({ href, label, icon, active, badge, badgeText }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  badgeText?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${label}(${badgeText})` : label}
      className={`relative flex min-w-16 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] ${active ? "font-medium text-accent" : "text-muted"}`}
    >
      {icon}
      {label}
      {badge ? (
        <span aria-hidden="true" className="absolute top-0.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 text-panel tabular-nums">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** 「メニュー」のシート。画面の下から出し、行き先を選ぶか、背景・×・Esc で閉じる */
function MoreSheet({ open, pathname, drafts, onClose, children }: {
  open: boolean;
  pathname: string;
  drafts: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  // 行き先へ移ったら閉じる(シートの中のリンクを押したとき)
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);
  return (
    <dialog
      ref={ref}
      aria-label="メニュー"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl border-t border-line bg-panel p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/25"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h2 className="font-semibold">メニュー</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="閉じる"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-background"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <nav className="flex flex-col gap-0.5">
            {MORE_LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-md px-2 py-2.5 ${active ? "bg-accent-soft font-medium text-accent" : "hover:bg-background"}`}
                >
                  <span className="flex items-center gap-2">
                    {l.icon}
                    {l.label}
                  </span>
                  {l.href === "/drafts" && drafts ? <span className="text-xs tabular-nums">{drafts}</span> : null}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      </div>
    </dialog>
  );
}
