import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MailOpenMarker } from "@/components/mail-open-marker";
import { MessageList } from "@/components/message-list";
import { requireAccount } from "@/lib/accounts";
import { shortDate } from "@/lib/format";
import { MAILBOXES, OLDER_BATCH, getOlderRemaining } from "@/lib/mail/imap";
import { getPendingCounts, listMessages } from "@/lib/queries";

export default function MailboxLayout({ children, params }: LayoutProps<"/mail/[mailbox]">) {
  return (
    // lg 未満では一覧とメールを並べず、どちらか一方を出す。メールを開いているか(目印 data-mail-open の有無)で、CSS の :has() で切り替える。
    // URL を読む部分は Suspense の中に閉じ込め、この枠や一覧・メールの表示を待たせない
    <div className="group/mail flex h-full">
      <Suspense fallback={null}>
        <MailOpenMarker />
      </Suspense>
      <Suspense fallback={<div className="hidden w-96 shrink-0 border-r border-line bg-panel lg:block" />}>
        <ListPane params={params} />
      </Suspense>
      <section className="hidden min-w-0 flex-1 overflow-y-auto group-has-data-mail-open/mail:block lg:block">{children}</section>
    </div>
  );
}

async function ListPane({ params }: { params: Promise<{ mailbox: string }> }) {
  const { mailbox } = await params;
  const box = MAILBOXES.find((b) => b.slug === mailbox);
  if (!box) notFound();
  const account = requireAccount();
  const [items, pending] = await Promise.all([listMessages(account.id, box.slug), getPendingCounts(account.id)]);
  return (
    <MessageList
      mailbox={box.slug}
      title={box.label}
      pendingClassify={pending.classify}
      olderRemaining={getOlderRemaining(account, box.slug)}
      olderBatch={OLDER_BATCH}
      items={items.map((m) => ({
        uid: m.uid,
        subject: m.subject || "(件名なし)",
        // 送信済みでは相手(宛先)を見せる
        who: box.slug === "sent" ? `宛先: ${m.to_text}` : m.from_name || m.from_addr,
        date: shortDate(m.date),
        seen: m.seen === 1,
        hasAttachments: m.has_attachments === 1,
        snippet: m.snippet.replace(/\s+/g, " "),
        threadSize: m.thread_size,
        category: m.classification?.category ?? null,
        priority: m.classification?.priority ?? null,
        handled: m.done ? "done" : m.replied ? "replied" : null,
        // 対応済みになったら、栞の判断はもう出さない
        closedHint: !m.done && !m.replied && m.closure?.status === "終わっていそう" ? m.closure.reason : null,
      }))}
    />
  );
}
