import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AiPanel } from "@/components/ai-panel";
import { MessageTabs } from "@/components/message-tabs";
import { SeenControl } from "@/components/seen-control";
import { getActiveAccount } from "@/lib/accounts";
import type { Classification, ExtractedItem } from "@/lib/ai/prompts";
import { bytes, fullDate } from "@/lib/format";
import { HEADER_NOTES } from "@/lib/mail/header-notes";
import { MAILBOXES } from "@/lib/mail/imap";
import { parseHeaderLines, parseRaw, splitRaw } from "@/lib/mail/parse";
import { getAiResults, getMessage, getThread, type AiResultRow } from "@/lib/queries";

/** 生データ欄に出す上限。添付が大きいメールで画面が固まらないようにする。 */
const RAW_PREVIEW_LIMIT = 200_000;

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
  const account = getActiveAccount();
  const message = await getMessage(account.id, box.slug, Number(uid));
  if (!message) notFound();

  const raw = Buffer.from(message.raw);
  const [thread, ai, parsed] = await Promise.all([
    getThread(account.id, message.thread_key),
    getAiResults(message.id),
    parseRaw(raw),
  ]);
  const { header } = splitRaw(raw);
  const headers = parseHeaderLines(header).map((h) => ({ ...h, note: HEADER_NOTES[h.name.toLowerCase()] ?? null }));
  const rawText = raw.toString("utf8");

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold">{message.subject || "(件名なし)"}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <SeenControl
              key={message.id}
              mailbox={box.slug}
              uid={message.uid}
              seen={message.seen === 1}
              // 実アカウントでは、開いただけでサーバ上のフラグを書き換えない
              autoMark={account.isLocal && box.slug === "inbox"}
            />
            <Link href={`/compose?reply=${message.id}`} className="rounded-md bg-accent px-3 py-1.5 font-medium text-panel hover:opacity-90">
              返信
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-0.5 text-muted">
          <dt>差出人</dt>
          <dd className="text-foreground">
            {message.from_name} <span className="text-muted">&lt;{message.from_addr}&gt;</span>
          </dd>
          <dt>宛先</dt>
          <dd>{message.to_text}</dd>
          {message.cc_text ? (
            <>
              <dt>Cc</dt>
              <dd>{message.cc_text}</dd>
            </>
          ) : null}
          <dt>日時</dt>
          <dd>{fullDate(message.date)}</dd>
        </dl>
      </header>

      <AiPanel
        key={`ai-${message.id}`}
        messageId={message.id}
        threadSize={thread.length}
        summary={ai.summary ? { text: ai.summary.result, meta: meta(ai.summary)! } : null}
        threadSummary={ai.thread_summary ? { text: ai.thread_summary.result, meta: meta(ai.thread_summary)! } : null}
        classification={ai.classify ? { value: parseResult<Classification>(ai.classify), meta: meta(ai.classify)! } : null}
        extraction={ai.extract ? { items: parseResult<{ items: ExtractedItem[] }>(ai.extract)?.items ?? [], meta: meta(ai.extract)! } : null}
      />

      <MessageTabs
        key={`tabs-${message.id}`}
        text={message.text}
        html={message.html}
        headers={headers}
        structure={message.structure ? JSON.parse(message.structure) : null}
        raw={rawText.slice(0, RAW_PREVIEW_LIMIT)}
        rawTruncated={rawText.length > RAW_PREVIEW_LIMIT}
        size={bytes(message.size)}
        attachments={parsed.attachments.map((a) => ({ ...a, size: bytes(a.size) }))}
      />

      {thread.length > 1 ? (
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="mb-1 font-semibold">このスレッド({thread.length} 通)</h2>
          <p className="mb-2 text-xs text-muted">
            References / In-Reply-To ヘッダの Message-ID をたどって、受信と送信済みをまたいでまとめています。
          </p>
          <ol className="flex flex-col">
            {thread.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/mail/${t.mailbox}/${t.uid}`}
                  aria-current={t.id === message.id ? "true" : undefined}
                  className={`flex gap-3 rounded px-2 py-1 ${t.id === message.id ? "bg-accent-soft" : "hover:bg-background"}`}
                >
                  <span className="w-40 shrink-0 text-xs tabular-nums text-muted">{fullDate(t.date)}</span>
                  <span className="w-28 shrink-0 truncate">{t.mailbox === "sent" ? "自分" : t.from_name || t.from_addr}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{t.text.replace(/\s+/g, " ").slice(0, 80)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
