import Link from "next/link";
import { AutoRunner } from "@/components/auto-runner";
import { InboxIcon, LogIcon, PlusIcon, SearchIcon, SentIcon, SettingsIcon, TasksIcon } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { SyncButton } from "@/components/sync-button";
import { getActiveAccount } from "@/lib/accounts";
import { getCounts } from "@/lib/queries";

export async function Sidebar() {
  const account = getActiveAccount();
  const counts = await getCounts(account.id);
  return (
    <div className="flex flex-col gap-4 p-3 pt-0">
      <div>
        <p className="text-xs text-muted">
          {account.isLocal ? "テストサーバ" : account.readOnly ? "実アカウント・読み取り専用" : "実アカウント"}
        </p>
        <p className="truncate font-medium" title={account.email}>
          {account.email}
        </p>
      </div>
      <Link
        href="/compose"
        className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 font-medium text-panel hover:opacity-90"
      >
        <PlusIcon />
        新規作成
      </Link>
      <SyncButton />
      <AutoRunner />
      <nav className="flex flex-col gap-0.5">
        <NavLink href="/mail/inbox" icon={<InboxIcon />} badge={counts.unread || undefined}>
          受信トレイ
        </NavLink>
        <NavLink href="/mail/sent" icon={<SentIcon />}>送信済み</NavLink>
        <p className="mt-3 px-2 text-xs text-muted">AI</p>
        <NavLink href="/search" icon={<SearchIcon />}>検索</NavLink>
        <NavLink href="/tasks" icon={<TasksIcon />}>予定・やること</NavLink>
        <p className="mt-3 px-2 text-xs text-muted">仕組み</p>
        <NavLink href="/inspector" icon={<LogIcon />}>通信ログ</NavLink>
        <NavLink href="/settings" icon={<SettingsIcon />}>設定</NavLink>
      </nav>
    </div>
  );
}
