import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AssistButton } from "@/components/assist-button";
import { aquaClass } from "@/components/aqua-button";
import { DoneButton } from "@/components/done-button";
import { TrashOneButton } from "@/components/trash-one-button";
import { ReplyIcon } from "@/components/icons";
import { MessageBody } from "@/components/message-body";
import { MoreActions } from "@/components/more-actions";
import { MarkSeen } from "@/components/mark-seen";
import { requireAccount } from "@/lib/accounts";
import type { Classification, ExtractedItem } from "@/lib/ai/prompts";
import { bytes, fullDate } from "@/lib/format";
import { MAILBOXES } from "@/lib/mail/imap";
import { parseRaw } from "@/lib/mail/parse";
import { USER_LABEL_MODEL } from "@/lib/ai/knn";
import { getAiResults, getHandled, getMessage, getThread, type AiResultRow } from "@/lib/queries";

export default function MessagePage({ params }: PageProps<"/mail/[mailbox]/[uid]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">読み込み中…</p>}>
      <MessageView params={params} />
    </Suspense>
  );
}

function parseResult<T>(row: AiResultRow | undefined): T | null {
  if (!row) return null;
  try {
    return JSON.parse(row.result) as T;
  } catch {
    return null;
  }
}

const meta = (row: AiResultRow | undefined) =>
  row ? { ms: row.ms, model: row.model, promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens } : null;

async function MessageView({ params }: { params: Promise<{ mailbox: string; uid: string }> }) {
  const { mailbox, uid } = await params;
  const box = MAILBOXES.find((b) => b.slug === mailbox);
  if (!box || !/^\d+$/.test(uid)) notFound();
  const account = requireAccount();
  const message = await getMessage(account.id, box.slug, Number(uid));
  if (!message) notFound();

  const [thread, ai, parsed, handled] = await Promise.all([
    getThread(account.id, message.thread_key),
    getAiResults(message.id),
    parseRaw(Buffer.from(message.raw)),
    getHandled(message.id),
  ]);

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 pt-2 text-xl font-semibold break-words">{message.subject || "(件名なし)"}</h1>
          <MarkSeen key={message.id} mailbox={box.slug} uid={message.uid} seen={message.seen === 1} />
          <div className="flex shrink-0 items-start gap-4">
            {/* 整理: 栞に聞く・捨てる・済ませる */}
            <AssistButton
              key={`ai-${message.id}`}
              messageId={message.id}
              threadSize={thread.length}
              summary={ai.summary ? { text: ai.summary.result, meta: meta(ai.summary)! } : null}
              threadSummary={ai.thread_summary ? { text: ai.thread_summary.result, meta: meta(ai.thread_summary)! } : null}
              classification={ai.classify ? { value: parseResult<Classification>(ai.classify), meta: meta(ai.classify)! } : null}
              classificationLabeled={ai.classify?.model === USER_LABEL_MODEL}
              extraction={ai.extract ? { items: parseResult<{ items: ExtractedItem[] }>(ai.extract)?.items ?? [], meta: meta(ai.extract)! } : null}
            />
            {box.slug === "inbox" ? (
              <>
                <TrashOneButton key={`trash-${message.id}`} uid={message.uid} />
                <DoneButton key={`done-${message.id}`} messageId={message.id} done={handled.done} replied={handled.replied} />
              </>
            ) : null}
            {/* 整理と応答の区切り。ボタンの高さ(下の名前は除く)に合わせる */}
            <span aria-hidden="true" className="mx-1 mt-1.5 h-10 w-px bg-line" />
            {/* 応答: ふだんは返信。転送のようにたまにしか使わないものは「…」にしまう */}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <Link href={`/compose?reply=${message.id}`} aria-label="返信" title="返信" className={aquaClass("solid", "md")}>
                <span className="flex items-center justify-center">
                  <ReplyIcon />
                </span>
              </Link>
              {/* ほかのボタンと同じく、下に名前を出す(読み上げは aria-label で伝わるので、こちらは読ませない) */}
              <span aria-hidden="true" className="text-[11px] text-muted">
                返信
              </span>
            </div>
            <MoreActions key={`more-${message.id}`} messageId={message.id} />
          </div>
        </div>
        <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 rounded-xl border border-line bg-panel px-3.5 py-3 text-muted">
          <dt>差出人</dt>
          <dd className="min-w-0 break-words text-foreground">
            <span className="font-medium">{message.from_name}</span> <span className="text-muted">&lt;{message.from_addr}&gt;</span>
          </dd>
          <dt>宛先</dt>
          <dd className="min-w-0 break-words">{message.to_text}</dd>
          {message.cc_text ? (
            <>
              <dt>Cc</dt>
              <dd className="min-w-0 break-words">{message.cc_text}</dd>
            </>
          ) : null}
          <dt>日時</dt>
          <dd className="tabular-nums">{fullDate(message.date)}</dd>
        </dl>
      </header>


      <MessageBody
        key={`body-${message.id}`}
        text={message.text}
        html={message.html}
        size={bytes(message.size)}
        attachments={parsed.attachments.map((a) => ({ ...a, size: bytes(a.size) }))}
      />

      {thread.length > 1 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3.5">
          <h2 className="font-medium">
            このスレッド <span className="text-xs font-normal text-muted">{thread.length} 通</span>
          </h2>
          <p className="text-xs text-muted">
            References / In-Reply-To ヘッダの Message-ID をたどって、受信と送信済みをまたいでまとめています。
          </p>
          <ol className="flex flex-col gap-0.5">
            {thread.map((t) => {
              const current = t.id === message.id;
              return (
                <li key={t.id}>
                  <Link
                    href={`/mail/${t.mailbox}/${t.uid}`}
                    aria-current={current ? "true" : undefined}
                    className={`flex items-baseline gap-3 rounded-lg px-2.5 py-1.5 ${current ? "bg-accent-soft" : "hover:bg-background"}`}
                  >
                    <span className="w-40 shrink-0 text-xs tabular-nums text-muted">{fullDate(t.date)}</span>
                    <span className={`w-28 shrink-0 truncate ${current ? "font-medium text-accent" : ""}`}>
                      {t.mailbox === "sent" ? "自分" : t.from_name || t.from_addr}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted">{t.text.replace(/\s+/g, " ").slice(0, 80)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
