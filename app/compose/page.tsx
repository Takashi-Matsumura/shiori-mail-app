import { Suspense } from "react";
import { ComposeForm } from "@/components/compose-form";
import { getActiveAccount } from "@/lib/accounts";
import { fullDate } from "@/lib/format";
import { getMessageById } from "@/lib/queries";

export default function ComposePage({ searchParams }: PageProps<"/compose">) {
  return (
    <div className="h-full overflow-y-auto">
      <Suspense fallback={<p className="p-6 text-muted">読み込み中…</p>}>
        <Compose searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Compose({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { reply } = await searchParams;
  const account = getActiveAccount();
  const replyId = typeof reply === "string" && /^\d+$/.test(reply) ? Number(reply) : null;
  const original = replyId ? await getMessageById(account.id, replyId) : null;

  let defaults = { to: "", cc: "", subject: "", body: "", inReplyTo: "", references: "[]" };
  if (original) {
    const refs: string[] = original.refs ? JSON.parse(original.refs) : [];
    const quoted = original.text.split("\n").map((l) => `> ${l}`).join("\n");
    defaults = {
      to: original.from_addr,
      cc: "",
      subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
      body: `\n\n${fullDate(original.date)} ${original.from_name || original.from_addr}:\n${quoted}`,
      // 返信では、元メールの Message-ID を In-Reply-To に、スレッドの履歴を References に入れる
      inReplyTo: original.message_id ?? "",
      references: JSON.stringify(original.message_id ? [...refs, original.message_id] : refs),
    };
  }

  return (
    <ComposeForm
      key={replyId ?? "new"}
      defaults={defaults}
      replyTo={original ? { id: original.id, subject: original.subject, from: original.from_name || original.from_addr } : null}
      account={{ email: account.email, name: account.name, isLocal: account.isLocal }}
    />
  );
}
