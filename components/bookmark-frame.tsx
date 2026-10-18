"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { saveBookmarkNoteAction, saveBookmarkTagsAction } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { BookmarkIcon, CloseIcon, SparkleIcon } from "@/components/icons";
import { BOOKMARK_NOTE_MAX, BOOKMARK_TAG_LENGTH, BOOKMARK_TAGS_MAX } from "@/lib/ai/prompts";
import { useAiStream, type StreamMeta } from "@/lib/client/use-ai-stream";
import { fullDate, shortDate } from "@/lib/format";

export type BookmarkFrameProps = {
  messageId: number;
  note: string;
  noteBy: "ai" | "user";
  tags: string[];
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
 * 挟んだメール(読みかけ)の枠。本文の列が広ければメール(children)の右に縦長の栞を立て、狭ければ上に横長の帯を出す。
 * どちらも押すと、メモ・キーワード・その後のメールとあらすじのパネルが開く。
 */
export function BookmarkFrame({ children, ...props }: BookmarkFrameProps & { children: React.ReactNode }) {
  const { messageId, note, noteBy, tags, created, after } = props;
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const noteStream = useAiStream(refresh);
  const [open, setOpen] = useState(false);

  const writeNote = noteStream.run;
  useEffect(() => {
    if (!note && noteBy === "ai" && Date.now() - created < AUTO_NOTE_MS) void writeNote("/api/ai/bookmark", { id: messageId, kind: "note" });
    // 挟んだ直後の 1 回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  const status = noteStream.state.running ? "栞が書いています…" : note || "メモなし";
  return (
    <>
      {/* 本文の列が狭いとき: メールの上に横長の帯(列の幅は、メール画面の article の @container で測る) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/40 px-3.5 py-2.5 text-left @lg:hidden [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <span className="text-accent">
          <BookmarkIcon />
        </span>
        <span className="min-w-0 flex-1 truncate">{status}</span>
        {tags.length > 0 ? <span className="shrink-0 text-xs text-accent">#{tags[0]}</span> : null}
        {after.length > 0 ? <span className="shrink-0 rounded-full bg-accent px-2 text-xs text-panel tabular-nums">その後 {after.length}</span> : null}
      </button>
      <div className="flex items-start gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
        <Ribbon status={status} tags={tags} created={created} after={after.length} onOpen={() => setOpen(true)} />
      </div>
      {open
        ? createPortal(
            <BookmarkSheet {...props} noteRunning={noteStream.state.running} noteError={noteStream.state.error} onWriteNote={() => writeNote("/api/ai/bookmark", { id: messageId, kind: "note" })} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

/** 広い画面で、メールの右に立てる縦長の栞。上に紐、下の端は V 字に切り欠く。メモは縦書き */
function Ribbon({ status, tags, created, after, onOpen }: { status: string; tags: string[]; created: number; after: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`読みかけ: ${status}(押すと詳しく開く)`}
      title="押すと、メモ・キーワード・その後のメールを開きます"
      className="sticky top-4 hidden w-24 shrink-0 flex-col items-center drop-shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent @lg:flex"
    >
      {/* 紐 */}
      <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-accent/60" />
      <span aria-hidden="true" className="h-4 w-px bg-accent/60" />
      <span className="flex w-full flex-col items-center gap-3 bg-accent-soft px-2 pt-3 pb-10 [clip-path:polygon(0_0,100%_0,100%_100%,50%_calc(100%-1.25rem),0_100%)]">
        <span className="text-[11px] text-accent tabular-nums">{shortDate(created)}</span>
        <span className="max-h-72 overflow-hidden text-[15px] leading-relaxed tracking-wider [text-orientation:upright] [writing-mode:vertical-rl]">
          <VerticalText text={status} />
        </span>
        {tags.length > 0 ? (
          <span className="flex w-full flex-col items-center gap-1">
            {tags.map((t) => (
              <span key={t} className="line-clamp-2 max-w-full text-center text-[11px] leading-snug text-accent [overflow-wrap:anywhere]">
                #{t}
              </span>
            ))}
          </span>
        ) : null}
        {after > 0 ? <span className="rounded-full bg-accent px-2 text-[11px] text-panel tabular-nums">その後 {after}</span> : null}
      </span>
    </button>
  );
}

/**
 * 縦書きのメモ。英数字は 1 字ずつ立て(text-orientation: upright)、1〜2 桁の数字は縦中横にして「10/19」を寝かせない。
 * 3 桁以上の数字は縦中横にすると潰れるので、1 字ずつ立てたままにする
 */
function VerticalText({ text }: { text: string }) {
  return text.split(/(?<!\d)(\d{1,2})(?!\d)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="[text-combine-upright:all]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** 右端から出すパネル。Esc・×・パネルの外を押すと閉じる(components/assist-button.tsx と同じ作り) */
function BookmarkSheet({ onClose, ...props }: BookmarkFrameProps & {
  noteRunning: boolean;
  noteError: string | null;
  onWriteNote: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="読みかけ"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(32rem,100%)] max-w-none border-l border-line bg-panel p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/25"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-1.5 font-semibold text-accent [&_svg]:size-4">
            <BookmarkIcon />
            読みかけ
            <span className="text-xs font-normal text-muted tabular-nums">{fullDate(props.created)} に挟んだ</span>
          </h2>
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            aria-label="閉じる"
            title="閉じる"
            className="-m-1.5 shrink-0 rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <NoteSection {...props} />
          <TagSection messageId={props.messageId} tags={props.tags} noteRunning={props.noteRunning} onSuggest={props.onWriteNote} />
          <AfterSection messageId={props.messageId} after={props.after} recap={props.recap} />
        </div>
      </div>
    </dialog>
  );
}

function NoteSection({ messageId, note, noteBy, noteRunning, noteError, onWriteNote }: BookmarkFrameProps & {
  noteRunning: boolean;
  noteError: string | null;
  onWriteNote: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">メモ</h3>
        {!editing && !noteRunning ? (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted underline hover:text-foreground">
            書き直す
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
      ) : note ? (
        <p className="flex items-start gap-1.5 [&_svg]:mt-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
          {noteBy === "ai" ? <SparkleIcon /> : null}
          <span>{note}</span>
        </p>
      ) : noteRunning ? (
        <p className="text-muted">栞がメモとキーワードを考えています…</p>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-muted">メモはありません。</p>
          <button type="button" onClick={onWriteNote} className={buttonClass}>
            栞に書かせる
          </button>
        </div>
      )}
      {noteError ? <p role="alert" className="text-xs text-red-600">{noteError}</p> : null}
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}

/**
 * キーワード。押すと読みかけの一覧をそのキーワードで絞り込み、× で消す。入力欄から足す。
 * 1 つも無ければ栞に提案させられる(メモと一緒に考えるので、栞が書いたメモは書き直される)
 */
function TagSection({ messageId, tags, noteRunning, onSuggest }: { messageId: number; tags: string[]; noteRunning: boolean; onSuggest: () => void }) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const save = (next: string[], after?: () => void) =>
    startSaving(async () => {
      const result = await saveBookmarkTagsAction(messageId, next);
      setError(result?.ok ? null : (result?.message ?? "保存できませんでした"));
      if (result?.ok) after?.();
    });
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="font-medium">キーワード</h3>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li key={t} className="flex items-center rounded-full border border-accent/50 bg-accent-soft/50 text-xs text-accent">
              <Link href={`/bookmarks?tag=${encodeURIComponent(t)}`} className="py-0.5 pl-2.5 pr-1 hover:underline" title={`「${t}」の読みかけを一覧で見る`}>
                #{t}
              </Link>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(tags.filter((x) => x !== t))}
                aria-label={`${t} を消す`}
                title="消す"
                className="rounded-full py-0.5 pr-2 pl-0.5 text-muted hover:text-foreground [&_svg]:size-3"
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : noteRunning ? (
        <p className="text-muted">栞がキーワードを考えています…</p>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-muted">キーワードはありません。</p>
          <button type="button" onClick={onSuggest} className={buttonClass}>
            栞に提案させる
          </button>
        </div>
      )}
      {tags.length < BOOKMARK_TAGS_MAX ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) save([...tags, draft], () => setDraft(""));
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BOOKMARK_TAG_LENGTH + 1}
            aria-label="足すキーワード"
            placeholder="例: 見積"
            className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1.5"
          />
          <button type="submit" disabled={saving || !draft.trim()} className={buttonClass}>
            足す
          </button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}

function AfterSection({ messageId, after, recap }: Pick<BookmarkFrameProps, "messageId" | "after" | "recap">) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const recapStream = useAiStream(refresh);
  const latest = after.length > 0 ? after[after.length - 1].id : 0;
  const live = recapStream.state.running || recapStream.state.text !== "";
  const text = live ? recapStream.state.text : (recap?.text ?? "");
  const meta = live ? recapStream.state.meta : (recap?.meta ?? null);
  const stale = !live && recap !== null && recap.upto < latest;
  if (after.length === 0) {
    return (
      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="font-medium">その後</h3>
        <p className="text-muted">挟んでから、このやり取りに新しいメールはありません。</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">その後 {after.length} 通</h3>
        {recapStream.state.running ? (
          <button type="button" onClick={recapStream.stop} className={buttonClass}>
            中止
          </button>
        ) : (
          <button type="button" onClick={() => recapStream.run("/api/ai/bookmark", { id: messageId, kind: "recap" })} className={buttonClass}>
            {text ? "聞き直す" : "あらすじを聞く"}
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
      {text ? <p className="whitespace-pre-wrap leading-relaxed">{text}</p> : null}
      {recapStream.state.running && !text ? <p className="text-muted">栞が読んでいます…</p> : null}
      {stale ? <p className="text-xs text-muted">このあらすじの後にも、メールが届いています。</p> : null}
      {!recapStream.state.running && meta ? <AiMeta {...meta} /> : null}
      {recapStream.state.error ? <p role="alert" className="text-xs text-red-600">{recapStream.state.error}</p> : null}
    </section>
  );
}
