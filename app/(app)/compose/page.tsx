import { Suspense } from "react";
import { ComposeForm, type ForwardSource, type ReplyContextData } from "@/components/compose-form";
import { getSignature, requireAccount } from "@/lib/accounts";
import { bytes, fullDate } from "@/lib/format";
import { parseRaw } from "@/lib/mail/parse";
import type { ExtractedItem } from "@/lib/ai/prompts";
import { getDraft } from "@/lib/drafts";
import { getAiResults, getMessageById, listContacts } from "@/lib/queries";

/** 引用に使う本文を整える。行末の空白を落とし、続く空行は 1 行にまとめる(HTML メールから作った本文は空行が多い) */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

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
  const { reply, forward } = await searchParams;
  const account = requireAccount();
  const id = (v: typeof reply) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const replyId = id(reply);
  const forwardId = replyId === null ? id(forward) : null;
  const original = replyId ? await getMessageById(account.id, replyId) : null;
  const forwarded = forwardId ? await getMessageById(account.id, forwardId) : null;

  const signature = getSignature();
  // 本文欄には自分の文章と署名だけを置く。引用・転送するメールは本文欄の下にたたんで見せ、送るときにサーバが末尾へ付ける
  const body = signature ? `\n\n${signature}` : "";
  let defaults = { to: "", cc: "", subject: "", body, quote: "", inReplyTo: "", references: "[]" };
  if (original) {
    const refs: string[] = original.refs ? JSON.parse(original.refs) : [];
    const quoted = tidy(original.text).split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
    defaults = {
      to: original.from_addr,
      cc: "",
      subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
      body,
      quote: `${fullDate(original.date)} ${original.from_name || original.from_addr}:\n${quoted}`,
      // 返信では、元メールの Message-ID を In-Reply-To に、スレッドの履歴を References に入れる
      inReplyTo: original.message_id ?? "",
      references: JSON.stringify(original.message_id ? [...refs, original.message_id] : refs),
    };
  }

  // 返信を書く横に出す、元のメールの要点(アシストで作った要約と抜き出し)
  let replyContext: ReplyContextData | null = null;
  if (original) {
    const ai = await getAiResults(original.id);
    let items: ExtractedItem[] | null = null;
    try {
      items = ai.extract ? ((JSON.parse(ai.extract.result) as { items?: ExtractedItem[] }).items ?? []) : null;
    } catch {}
    replyContext = { messageId: original.id, summary: ai.summary?.result ?? null, items };
  }

  let forwardOf: ForwardSource | null = null;
  if (forwarded) {
    const refs: string[] = forwarded.refs ? JSON.parse(forwarded.refs) : [];
    const from = forwarded.from_name ? `${forwarded.from_name} <${forwarded.from_addr}>` : forwarded.from_addr;
    const header = [
      "---------- 転送メッセージ ----------",
      `差出人: ${from}`,
      `日時: ${fullDate(forwarded.date)}`,
      `件名: ${forwarded.subject}`,
      `宛先: ${forwarded.to_text}`,
      ...(forwarded.cc_text ? [`Cc: ${forwarded.cc_text}`] : []),
    ].join("\n");
    defaults = {
      to: "",
      cc: "",
      subject: /^(fwd?|転送):/i.test(forwarded.subject) ? forwarded.subject : `Fwd: ${forwarded.subject}`,
      body,
      quote: `${header}\n\n${tidy(forwarded.text)}`,
      // 転送は返事ではないので In-Reply-To は付けない。References だけで、元のスレッドとのつながりを残す
      inReplyTo: "",
      references: JSON.stringify(forwarded.message_id ? [...refs, forwarded.message_id] : refs),
    };
    // 添付は、最初は全部付ける。外したいものは作成画面でチェックを外す(中身は送信のときにサーバが元メールから取り出す)
    const { attachments } = await parseRaw(Buffer.from(forwarded.raw));
    forwardOf = {
      id: forwarded.id,
      subject: forwarded.subject,
      from: forwarded.from_name || forwarded.from_addr,
      attachments: attachments.map((a, index) => ({ index, filename: a.filename, size: bytes(a.size), bytes: a.size })),
    };
  }

  const draftKind = original ? `reply-${original.id}` : forwardOf ? `forward-${forwardOf.id}` : "new";
  return (
    <ComposeForm
      key={replyId ? `reply-${replyId}` : forwardOf ? `forward-${forwardOf.id}` : "new"}
      defaults={defaults}
      replyTo={original ? { id: original.id, subject: original.subject, from: original.from_name || original.from_addr } : null}
      forward={forwardOf}
      replyContext={replyContext}
      account={{ email: account.email, name: account.name, readOnly: account.readOnly }}
      contacts={await listContacts(account.id, account.email)}
      draftKind={draftKind}
      savedDraft={getDraft(draftKind)}
    />
  );
}
