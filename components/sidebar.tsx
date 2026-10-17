import Link from "next/link";
import { AutoRunner } from "@/components/auto-runner";
import { DraftIcon, InboxIcon, PlusIcon, SearchIcon, SentIcon, SettingsIcon, TasksIcon } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { SyncButton } from "@/components/sync-button";
import { getAccount } from "@/lib/accounts";
import { countDrafts } from "@/lib/drafts";
import { getCounts } from "@/lib/queries";

export async function Sidebar() {
  const account = getAccount();
  const counts = account ? await getCounts(account.id) : null;
  const drafts = account ? await countDrafts() : 0;
  return (
    <div className="flex flex-col gap-4 p-3 pt-0">
      {account ? (
        <div>
          {account.readOnly ? <p className="text-xs text-muted">読み取り専用</p> : null}
          <p className="truncate font-medium" title={account.email}>
            {account.email}
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-line bg-background p-2 text-xs">
          メールアカウントが未設定です。
          <Link href="/settings" className="text-accent underline">
            設定画面
          </Link>
          で登録してください。
        </p>
      )}
      <Link
        href="/compose"
        className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 font-medium text-panel hover:opacity-90"
      >
        <PlusIcon />
        新規作成
      </Link>
      {account ? (
        <>
          <SyncButton />
          {/* アカウントを変えたら作り直し、前のアカウントでの結果(エラーなど)を残さない */}
          <AutoRunner key={account.email} />
        </>
      ) : null}
      <nav className="flex flex-col gap-0.5">
        <NavLink href="/mail/inbox" icon={<InboxIcon />} badge={counts?.unread || undefined}>
          受信トレイ
        </NavLink>
        <NavLink href="/mail/sent" icon={<SentIcon />}>送信済み</NavLink>
        <NavLink href="/drafts" icon={<DraftIcon />} badge={drafts || undefined}>
          下書き
        </NavLink>
        <p className="mt-3 px-2 text-xs text-muted">栞</p>
        <NavLink href="/search" icon={<SearchIcon />}>検索</NavLink>
        <NavLink href="/tasks" icon={<TasksIcon />}>予定・やること</NavLink>
        <span className="mt-3" />
        <NavLink href="/settings" icon={<SettingsIcon />}>設定</NavLink>
      </nav>
    </div>
  );
}
