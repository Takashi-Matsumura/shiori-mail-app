import Link from "next/link";
import { InboxIcon, LogIcon, PlusIcon, SearchIcon, SentIcon, SettingsIcon, TasksIcon } from "@/components/icons";
import { RailLink } from "@/components/nav-link";
import { getActiveAccount } from "@/lib/accounts";
import { getCounts } from "@/lib/queries";

/** 畳んだ左パネルに出す帯。アイコンだけで移動はできるようにする。 */
export async function SidebarRail() {
  const counts = await getCounts(getActiveAccount().id);
  return (
    <nav className="flex flex-col items-center gap-1 px-1 pb-3">
      <Link
        href="/compose"
        aria-label="新規作成"
        title="新規作成"
        className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-accent text-panel hover:opacity-90"
      >
        <PlusIcon />
      </Link>
      <RailLink href="/mail/inbox" label="受信トレイ" icon={<InboxIcon />} badge={counts.unread || undefined} />
      <RailLink href="/mail/sent" label="送信済み" icon={<SentIcon />} />
      <span className="my-1 h-px w-6 bg-line" />
      <RailLink href="/search" label="検索" icon={<SearchIcon />} />
      <RailLink href="/tasks" label="予定・やること" icon={<TasksIcon />} />
      <span className="my-1 h-px w-6 bg-line" />
      <RailLink href="/inspector" label="通信ログ" icon={<LogIcon />} />
      <RailLink href="/settings" label="設定" icon={<SettingsIcon />} />
    </nav>
  );
}
