"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { saveBookmarkNoteAction } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { BookmarkIcon, SparkleIcon } from "@/components/icons";
import { BOOKMARK_NOTE_MAX } from "@/lib/ai/prompts";
import { useAiStream, type StreamMeta } from "@/lib/client/use-ai-stream";
import { fullDate, shortDate } from "@/lib/format";

export type BookmarkBandProps = {
  messageId: number;
  note: string;
  noteBy: "ai" | "user";
  created: number;
  /** 挟んだ後に届いた・送ったメール(古い順) */
  after: { id: number; href: string; from: string; date: number; sent: boolean }[];
  /** 保存済みのあらすじ。upto はそのとき読ませた最後のメールの id */
  recap: { text: string; upto: number; meta: StreamMeta } | null;
};

/** 挟んですぐ(この時間内)にメモが空なら、栞に書かせる。後から開いたときに勝手に AI を動かさないため */
const AUTO_NOTE_MS = 60_000;

const buttonClass = "rounded-full border border-accent px-3 py-1 text-xs text-accent transition-colors hover:bg-accent-soft disabled:opacity-60";

/**
 * 挟んだメール(読みかけ)の上に出す帯。挟んだときのメモと、その後に届いたメール、栞のあらすじを並べる。
 */
export function BookmarkBand({ messageId, note, noteBy, created, after, recap }: BookmarkBandProps) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const noteStream = useAiStream(refresh);
  const recapStream = useAiStream(refresh);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const writeNote = noteStream.run;
  useEffect(() => {
    if (!note && noteBy === "ai" && Date.now() - created < AUTO_NOTE_MS) void writeNote("/api/ai/bookmark", { id: messageId, kind: "note" });
    // 挟んだ直後の 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  // 書き終えてから読み直すまでの間も、書いた文を出しておく
  const noteText = note || noteStream.state.text;
  const latest = after.length > 0 ? after[after.length - 1].id : 0;
  const recapLive = recapStream.state.running || recapStream.state.text !== "";
  const recapText = recapLive ? recapStream.state.text : (recap?.text ?? "");
  const recapMeta = recapLive ? recapStream.state.meta : (recap?.meta ?? null);
  const stale = !recapLive && recap !== null && recap.upto < latest;

  return (
    <section aria-label="読みかけ" className="flex flex-col gap-2.5 rounded-xl border border-accent/40 bg-accent-soft/40 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-accent [&_svg]:size-4">
          <BookmarkIcon />
          読みかけ
          <span className="text-xs font-normal text-muted tabular-nums">{fullDate(created)} に挟んだ</span>
        </h2>
        {!editing && !noteStream.state.running ? (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted underline hover:text-foreground">
            メモを書き直す
          </button>
        ) : null}
      </div>

      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          action={(form) =>
            startSaving(async () => {
              const result = await saveBookmarkNoteAction(messageId, String(form.get("note") ?? ""));
              setError(result?.ok ? null : (result?.message ?? "保存できませんでした"));
              if (result?.ok) setEditing(false);
            })
          }
        >
          <input
            name="note"
            defaultValue={note}
            maxLength={BOOKMARK_NOTE_MAX}
            autoFocus
            aria-label="メモ"
            placeholder="戻ってきたときに、次に何をするか"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1.5"
          />
          <button type="submit" disabled={saving} className={buttonClass}>
            保存
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:text-foreground">
            取り消す
          </button>
        </form>
      ) : noteText ? (
        <p className="flex items-start gap-1.5 [&_svg]:mt-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
          {noteBy === "ai" ? <SparkleIcon /> : null}
          <span>{noteText}</span>
        </p>
      ) : noteStream.state.running ? (
        <p className="text-muted">栞がメモを書いています…</p>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-muted">メモはありません。</p>
          <button type="button" onClick={() => writeNote("/api/ai/bookmark", { id: messageId, kind: "note" })} className={buttonClass}>
            栞に書かせる
          </button>
        </div>
      )}
      {noteStream.state.error ? <p role="alert" className="text-xs text-red-600">{noteStream.state.error}</p> : null}
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}

      {after.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">その後 {after.length} 通</h3>
            {recapStream.state.running ? (
              <button type="button" onClick={recapStream.stop} className={buttonClass}>
                中止
              </button>
            ) : (
              <button type="button" onClick={() => recapStream.run("/api/ai/bookmark", { id: messageId, kind: "recap" })} className={buttonClass}>
                {recapText ? "聞き直す" : "あらすじを聞く"}
              </button>
            )}
          </div>
          <ol className="flex flex-col gap-0.5 text-xs">
            {after.map((t) => (
              <li key={t.id}>
                <Link href={t.href} className="flex items-baseline gap-3 rounded-md px-1.5 py-1 hover:bg-background">
                  <span className="w-20 shrink-0 tabular-nums text-muted">{shortDate(t.date)}</span>
                  <span className="truncate">{t.sent ? "自分" : t.from}</span>
                </Link>
              </li>
            ))}
          </ol>
          {recapText ? <p className="whitespace-pre-wrap leading-relaxed">{recapText}</p> : null}
          {recapStream.state.running && !recapText ? <p className="text-muted">栞が読んでいます…</p> : null}
          {stale ? <p className="text-xs text-muted">このあらすじの後にも、メールが届いています。</p> : null}
          {!recapStream.state.running && recapMeta ? <AiMeta {...recapMeta} /> : null}
          {recapStream.state.error ? <p role="alert" className="text-xs text-red-600">{recapStream.state.error}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-muted">挟んでから、このやり取りに新しいメールはありません。</p>
      )}
    </section>
  );
}
