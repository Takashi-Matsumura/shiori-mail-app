import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MessageList } from "@/components/message-list";
import { requireAccount } from "@/lib/accounts";
import { shortDate } from "@/lib/format";
import { MAILBOXES } from "@/lib/mail/imap";
import { getPendingCounts, listMessages } from "@/lib/queries";

export default function MailboxLayout({ children, params }: LayoutProps<"/mail/[mailbox]">) {
  return (
    <div className="flex h-full">
      <Suspense fallback={<div className="w-96 shrink-0 border-r border-line bg-panel" />}>
        <ListPane params={params} />
      </Suspense>
      <section className="min-w-0 flex-1 overflow-y-auto">{children}</section>
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
      }))}
    />
  );
}
