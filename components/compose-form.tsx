"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { sendAction, type SendState } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { AddressInput, type ContactOption } from "@/components/address-input";
import { AquaButton } from "@/components/aqua-button";
import { AttachmentPreview, type PreviewTarget } from "@/components/attachment-preview";
import { DisclosureButton } from "@/components/disclosure-button";
import { ReplyContext } from "@/components/reply-context";
import { SendReview } from "@/components/send-review";
import { CheckIcon, CloseIcon, PaperclipIcon, SentIcon, SparkleIcon } from "@/components/icons";
import { TONES, type ExtractedItem, type SubjectResponse } from "@/lib/ai/prompts";
import { useNotices } from "@/lib/client/notices";
import { useAiStream } from "@/lib/client/use-ai-stream";
import { useComposeDraft } from "@/lib/client/use-compose-draft";
import type { ComposeDraft } from "@/lib/drafts";
import { bytes, fullDate } from "@/lib/format";
import { isPreviewable } from "@/lib/mail/attachment-types";
import { ATTACH_MAX_FILES, ATTACH_MAX_TOTAL } from "@/lib/mail/limits";
import { useSendReview } from "@/lib/client/use-send-review";

/** 転送するメール。attachments の index は、送信のときにサーバが元メールの添付を取り出す番号 */
export type ForwardSource = {
  id: number;
  subject: string;
  from: string;
  attachments: { index: number; filename: string; contentType: string; size: string; bytes: number }[];
};

export type ReplyContextData = { messageId: number; summary: string | null; items: ExtractedItem[] | null };

type Props = {
  /** quote は本文の下にたたんで見せる引用(返信)か転送するメール。送るときにサーバが本文の末尾へ付ける */
  // intro は本文の頭に最初から入れておく文章(転送の書き出し)。body は署名だけの本文で、栞の下書きはその上に入れる
  defaults: { to: string; cc: string; bcc: string; subject: string; intro: string; body: string; quote: string; inReplyTo: string; references: string; includeQuote: boolean };
  replyTo: { id: number; subject: string; from: string } | null;
  forward: ForwardSource | null;
  replyContext: ReplyContextData | null;
  account: { email: string; name: string; readOnly: boolean };
  contacts: ContactOption[];
  /** draftKind の書きかけ(サーバに保存済みのもの)。無ければ null */
  draftKind: string;
  /** キャンセルしたときの戻り先 */
  returnTo: string;
  savedDraft: ComposeDraft | null;
  /** 下書きの一覧から開いたときの書きかけ。最初からこの内容で開く */
  restored: ComposeDraft | null;
};

/** 宛先の横の「Cc」「Bcc」(欄を出すボタン) */
const addFieldClass = "shrink-0 rounded-md border border-line px-2 py-1.5 text-xs text-muted hover:bg-panel hover:text-foreground";

/** 宛先の欄の値を、確認のために見せる形にする(候補を選んだあとに残る末尾の「, 」を落とす) */
const listText = (value: string) => value.replace(/[,;\s]+$/, "");

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

export function ComposeForm({ defaults, replyTo, forward, replyContext, account, contacts, draftKind, savedDraft, restored, returnTo }: Props) {
  const router = useRouter();
  const { notify } = useNotices();
  // 開いたときの内容(書きかけを戻したならその内容)。書き換えたかどうかはこれと比べる。
  // 開いたあとに画面が描き直されても(下書きの件数を出すための更新など)変えない。
  // defaults.body は署名だけの本文のままにしておき、署名の上に下書きを入れる処理で使う
  const [start] = useState(() => ({
    to: restored?.to ?? defaults.to,
    cc: restored?.cc ?? defaults.cc,
    bcc: restored?.bcc ?? defaults.bcc,
    subject: restored?.subject ?? defaults.subject,
    body: restored?.body ?? defaults.intro + defaults.body,
    includeQuote: restored?.includeQuote ?? defaults.includeQuote,
  }));
  const [to, setTo] = useState(start.to);
  const [cc, setCc] = useState(start.cc);
  const [bcc, setBcc] = useState(start.bcc);
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  // 返信の引用は外せる。転送するメールは転送そのものなので、いつも付ける
  const [includeQuote, setIncludeQuote] = useState(start.includeQuote);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const quoteId = useId();
  // 自分で付けるファイル。書きかけの保存には入らない(ファイルはこの画面の中だけで持つ)。
  // 画像・PDF・テキストは中身を見るための URL(blob:)も一緒に持ち、外したときと画面を離れるときに捨てる
  const [files, setFiles] = useState<PickedFile[]>([]);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach(revokePreview), []);
  // サムネイルを押して中身を見ている添付
  const [viewing, setViewing] = useState<PreviewTarget | null>(null);
  const attachIds = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const forwardTotal = forward?.attachments.reduce((sum, a) => sum + a.bytes, 0) ?? 0;
  const attachCount = files.length + (forward?.attachments.length ?? 0);
  const addFiles = (list: FileList | File[]) => {
    const incoming = [...list].filter((f) => f.size > 0);
    const added: File[] = [];
    for (const f of incoming) {
      // 同じファイルを 2 度選んだら、1 つだけにする
      const same = (n: File) => n.name === f.name && n.size === f.size && n.lastModified === f.lastModified;
      if (!files.some((p) => same(p.file)) && !added.some(same)) added.push(f);
    }
    const count = files.length + added.length;
    const total = [...files.map((p) => p.file), ...added].reduce((sum, f) => sum + f.size, forwardTotal);
    if (count > ATTACH_MAX_FILES) return setFileError(`添付できるのは ${ATTACH_MAX_FILES} 個までです。`);
    if (total > ATTACH_MAX_TOTAL) return setFileError(`添付の合計は ${bytes(ATTACH_MAX_TOTAL)} までです(いま ${bytes(total)})。`);
    setFileError(null);
    setFiles([...files, ...added.map((file) => ({ file, preview: isPreviewable(file.type) ? URL.createObjectURL(file) : null }))]);
    unconfirm();
  };
  const removeFile = (p: PickedFile) => {
    revokePreview(p);
    setFiles(files.filter((x) => x !== p));
    setFileError(null);
    unconfirm();
  };
  // Cc はたまにしか使わないので、入っているときと、「Cc」を押したときだけ出す
  const [showCc, setShowCc] = useState(start.cc !== "");
  const [showBcc, setShowBcc] = useState(start.bcc !== "");
  // 書きかけの自動保存(このブラウザに保存)。開いたときに前回の書きかけがあれば、戻すかを聞く
  const initial = start;
  const draft = useComposeDraft(draftKind, savedDraft, { to, cc, bcc, subject, body, includeQuote }, initial);
  // 新規作成の書きかけの名前を URL に残す。自動同期などで画面が描き直されても、同じ書きかけのまま書き続けられるように
  useEffect(() => {
    if (!draftKind.startsWith("new")) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("draft") === draftKind) return;
    url.searchParams.set("draft", draftKind);
    window.history.replaceState(null, "", url);
  }, [draftKind]);
  const restore = () => {
    if (!draft.saved) return;
    setTo(draft.saved.to);
    setCc(draft.saved.cc);
    setShowCc(draft.saved.cc !== "");
    setBcc(draft.saved.bcc);
    setShowBcc(draft.saved.bcc !== "");
    setSubject(draft.saved.subject);
    setBody(draft.saved.body);
    setIncludeQuote(draft.saved.includeQuote);
    unconfirm();
  };
  // 送れたら、結果はヘッダーのお知らせで伝えて一覧へ戻る。遷移もアクションの中で行い、戻るまで「送信中…」のままにする。
  const [state, action, pending] = useActionState<SendState, FormData>(async (prev, formData) => {
    // 送っている間と送ったあとは書きかけを保存しない(送れた書きかけはサーバが消す)
    draft.stop();
    // 自分で付けたファイルは画面の状態にあるので、ここで送る中身へ入れる
    formData.delete("attachment");
    for (const p of files) formData.append("attachment", p.file);
    const next = await sendAction(prev, formData);
    if (!next?.ok) draft.resume();
    if (next?.ok) {
      const { rejected, appended } = next.result;
      const problems = [
        rejected.length > 0 ? `拒否された宛先: ${rejected.join(", ")}` : null,
        appended === false ? "送信済みへの控えは保存できませんでした" : null,
      ].filter(Boolean);
      notify(
        problems.length > 0
          ? { source: "send", kind: "error", text: `${next.to} へ送信しました。ただし${problems.join("。")}` }
          : { source: "send", kind: "info", text: `${next.to} へ送信しました` },
      );
      router.push("/mail/inbox");
    }
    return next;
  }, null);
  // 送信前の確認。チェックを入れたら栞が見直す。どこかを書き換えたら、確認し直してもらうために外す。
  const [confirmed, setConfirmed] = useState(false);
  // 見直しの終わりを待たずに送ることにしたか
  const [skipReview, setSkipReview] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]);
  const subjects = useSubjectSuggestions();
  // 件名の候補は新規作成でだけ出す(返信と転送は、元の件名から作ってある)
  const ownText = defaults.body && body.endsWith(defaults.body) ? body.slice(0, -defaults.body.length) : body;
  const canSuggest = !replyTo && !forward && !subject.trim() && ownText.trim().length >= SUBJECT_MIN_TEXT;
  const suggestSubject = () => subjects.start({ to, text: ownText });
  const ai = useAiStream();
  const review = useSendReview();
  const reviewing = review.state.status === "running";

  const unconfirm = () => {
    setConfirmed(false);
    setSkipReview(false);
    review.reset();
  };

  const toggleConfirm = (checked: boolean) => {
    if (!checked) return unconfirm();
    setConfirmed(true);
    // 本文が空なら送信のときに止まるので、見直しは頼まない
    if (body.trim()) review.start({ to, cc, subject, text: body, replyTo: replyTo?.id, attachments: attachCount });
  };

  const cancel = () => {
    const edited =
      to !== start.to || cc !== start.cc || bcc !== start.bcc || subject !== start.subject || body !== start.body || includeQuote !== start.includeQuote;
    if (edited && !window.confirm("書きかけの内容を破棄して戻りますか？")) return;
    if (edited) draft.discard();
    ai.stop();
    // 「戻る」は使わない。ロック画面から開いたときなどに、ログイン画面へ戻ってしまうため。決まった戻り先へ移る
    router.push(returnTo);
  };

  const generate = () => {
    // 下書きは本文の先頭(引用の上)に流し込む。前回の下書きがあれば置き換える。
    const rest = defaults.body && body.endsWith(defaults.body) ? defaults.body : "";
    let draft = "";
    unconfirm();
    setBody(rest);
    ai.run("/api/ai/draft", { replyTo: replyTo?.id, forwardOf: forward?.id, instruction, tone }, (delta) => {
      draft += delta;
      setBody(draft + rest);
    });
  };

  // 左に操作(送信・キャンセル)、真ん中にメール、右に栞(AI)。狭い画面では メール → 栞 → 操作 の順に縦へ積む。
  return (
    <form
      action={action}
      // ファイルは画面のどこへドラッグしても添付できる(受け付けている間は左の「添付」を目立たせる)
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
      className="mx-auto grid min-h-full max-w-7xl grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[12rem_minmax(0,1fr)_18rem]"
    >
      <input type="hidden" name="inReplyTo" value={defaults.inReplyTo} />
      <input type="hidden" name="references" value={defaults.references} />
      {forward ? <input type="hidden" name="forwardOf" value={forward.id} /> : null}
      <input type="hidden" name="draftKind" value={draftKind} />

      <section aria-label="操作" className="order-3 flex flex-col gap-3 lg:order-1">
        <div className="flex flex-col gap-3 lg:sticky lg:top-0">
          {account.readOnly ? (
            <p className="rounded-xl border border-line bg-panel p-3.5 text-xs leading-relaxed text-muted">
              読み取り専用モードなので送信できません。下書きと栞のアシストは使えます。送るときは設定画面でモードを外してください。
            </p>
          ) : (
            <div className={`overflow-hidden rounded-xl border bg-panel transition-colors ${confirmed ? "border-accent" : "border-line"}`}>
              <p className="px-3.5 pt-3 text-[11px] font-medium tracking-wider text-muted">送信前の確認</p>
              <dl className="flex flex-col gap-2 px-3.5 pb-3 pt-2 text-xs">
                <div>
                  <dt className="text-muted">差出人</dt>
                  <dd className="truncate" title={account.email}>{account.email}</dd>
                </div>
                <div>
                  <dt className="text-muted">宛先</dt>
                  <dd className="break-all font-medium">{listText(to) || <span className="font-normal text-muted">未入力</span>}</dd>
                </div>
                {cc ? (
                  <div>
                    <dt className="text-muted">Cc</dt>
                    <dd className="break-all font-medium">{listText(cc)}</dd>
                  </div>
                ) : null}
                {bcc ? (
                  <div>
                    <dt className="text-muted">Bcc(ほかの宛先には見えません)</dt>
                    <dd className="break-all font-medium">{listText(bcc)}</dd>
                  </div>
                ) : null}
              </dl>
              <label
                className={`flex cursor-pointer select-none items-center gap-2.5 border-t px-3.5 py-2.5 transition-colors ${
                  confirmed ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-background"
                }`}
              >
                <input
                  type="checkbox"
                  name="confirmSend"
                  value="yes"
                  checked={confirmed}
                  onChange={(e) => toggleConfirm(e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [&_svg]:size-3.5 ${
                    confirmed ? "border-accent bg-accent text-panel" : "border-line bg-panel"
                  }`}
                >
                  {confirmed ? <CheckIcon /> : null}
                </span>
                <span className="text-xs font-medium">この内容で送る</span>
              </label>
              {confirmed && review.state.status !== "idle" ? (
                <p className="flex items-center gap-1.5 border-t border-accent px-3.5 py-2 text-xs text-muted">
                  {review.state.status === "running" ? (
                    <>
                      <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
                      <span className="min-w-0 flex-1">栞が見直し中…</span>
                      {skipReview ? null : (
                        <button type="button" onClick={() => setSkipReview(true)} className="shrink-0 underline hover:text-foreground">
                          待たずに送る
                        </button>
                      )}
                    </>
                  ) : review.state.status === "failed" ? (
                    "栞の見直しに失敗しました"
                  ) : review.state.result.issues.length > 0 ? (
                    <span className="text-foreground">栞の指摘が {review.state.result.issues.length} 件あります</span>
                  ) : (
                    "栞の見直し: 問題なし"
                  )}
                </p>
              ) : null}
            </div>
          )}
          <div className="flex items-center justify-center gap-4 pt-1">
            <AquaButton type="button" tone="glass" size="sm" label="キャンセル" onClick={cancel} disabled={pending}>
              <CloseIcon />
            </AquaButton>
            <AquaButton
              type="submit"
              size="lg"
              label={
                pending
                  ? "送信中…"
                  : !confirmed
                    ? "送信(先に「この内容で送る」をチェック)"
                    : reviewing && !skipReview
                      ? "送信(栞の見直しが終わるまでお待ちください)"
                      : "送信"
              }
              disabled={pending || ai.state.running || account.readOnly || !confirmed || (reviewing && !skipReview)}
              className={pending ? "animate-pulse" : ""}
            >
              <span className="-translate-x-px translate-y-px">
                <SentIcon />
              </span>
            </AquaButton>
          </div>
          {state && !state.ok ? <p role="alert" className="text-red-600">{state.message}</p> : null}
          <div
            className={`flex flex-col gap-2 rounded-xl border bg-panel p-3 transition-colors ${
              dragging ? "border-dashed border-accent bg-accent-soft" : "border-line"
            }`}
          >
            <p className="flex items-baseline justify-between text-[11px] font-medium tracking-wider text-muted">
              <span>添付</span>
              {attachCount > 0 ? <span className="tabular-nums">{attachCount} 個</span> : null}
            </p>
            {attachCount > 0 ? (
              // 多いときは、この中だけを送る(操作の列は画面に貼り付いているので、下が見えなくならないように)
              <ul className="-mx-1 flex flex-col gap-0.5 overflow-y-auto lg:max-h-[50vh]">
                {/* 元メールの添付。最初は全部付け、要らないものだけ外す。本文は変わらないので、送信前の確認はそのまま */}
                {forward?.attachments.map((a) => {
                  const url = `/api/attachments/${forward.id}/${a.index}`;
                  const id = `${attachIds}-forward-${a.index}`;
                  return (
                    // サムネイルは中身を見るボタンなので、チェックの label の外に置く
                    <li key={`forward-${a.index}`} className="flex items-center gap-2 rounded-md p-1 not-has-checked:opacity-50 hover:bg-background">
                      <input id={id} type="checkbox" name="forwardAttachment" value={a.index} defaultChecked className="shrink-0 accent-accent" />
                      <AttachmentThumb
                        name={a.filename}
                        src={isImage(a.contentType) ? url : null}
                        onOpen={isPreviewable(a.contentType) ? () => setViewing({ name: a.filename, size: a.size, contentType: a.contentType, url }) : undefined}
                      />
                      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer">
                        <AttachmentName name={a.filename} size={a.size} />
                      </label>
                    </li>
                  );
                })}
                {files.map((p) => (
                  <li key={`${p.file.name}-${p.file.size}-${p.file.lastModified}`} className="flex items-center gap-2 rounded-md p-1 hover:bg-background">
                    <AttachmentThumb
                      name={p.file.name}
                      src={isImage(p.file.type) ? p.preview : null}
                      onOpen={
                        p.preview
                          ? () => setViewing({ name: p.file.name, size: bytes(p.file.size), contentType: p.file.type, url: p.preview! })
                          : undefined
                      }
                    />
                    <AttachmentName name={p.file.name} size={bytes(p.file.size)} />
                    <button
                      type="button"
                      onClick={() => removeFile(p)}
                      aria-label={`${p.file.name} を外す`}
                      title="外す"
                      className="shrink-0 rounded p-0.5 text-muted hover:bg-panel hover:text-foreground [&_svg]:size-3.5"
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line px-2 py-3 text-xs text-muted transition-colors hover:border-accent hover:text-accent [&_svg]:size-4"
            >
              <PaperclipIcon />
              <span className="font-medium">ファイルを添付</span>
              <span className="text-center text-[11px] leading-snug">
                ドラッグでも付けられます
                <br />
                合計 {bytes(ATTACH_MAX_TOTAL)} まで
              </span>
            </button>
            {/* name を付けない(送る中身へは、送信のときに files から入れる) */}
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {fileError ? <p role="alert" className="text-xs text-red-600">{fileError}</p> : null}
            {viewing ? <AttachmentPreview target={viewing} onClose={() => setViewing(null)} /> : null}
          </div>
        </div>
      </section>

      <section aria-label="メール" className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">{replyTo ? "返信" : forward ? "転送" : "新規作成"}</h1>
          {replyTo ? <p className="text-muted">{replyTo.from} さんの「{replyTo.subject}」への返信</p> : null}
          {forward ? <p className="text-muted">{forward.from} さんの「{forward.subject}」を転送</p> : null}
        </div>
        {draft.saved ? (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent bg-accent-soft px-3.5 py-2 text-xs">
            <span className="min-w-0 flex-1">前回の書きかけがあります({fullDate(draft.saved.savedAt)} に保存)</span>
            <button type="button" onClick={restore} className="font-medium text-accent underline">
              書きかけに戻す
            </button>
            <button type="button" onClick={draft.discard} className="text-muted underline hover:text-foreground">
              破棄する
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-[4rem_1fr] items-center gap-x-2 gap-y-2">
          <span className="text-muted">差出人</span>
          <span>{account.name ? `${account.name} <${account.email}>` : account.email}</span>
          <label htmlFor="to" className="text-muted">宛先</label>
          {/* 返信は宛先が決まっているので本文から、新規作成と転送は宛先から書き始める */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AddressInput
                id="to"
                name="to"
                value={to}
                onChange={(v) => {
                  setTo(v);
                  unconfirm();
                }}
                contacts={contacts}
                className={inputClass}
                placeholder="someone@example.com"
                autoFocus={!replyTo}
              />
            </div>
            {showCc ? null : (
              <button type="button" onClick={() => setShowCc(true)} aria-label="Cc を追加" title="Cc を追加" className={addFieldClass}>
                Cc
              </button>
            )}
            {showBcc ? null : (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                aria-label="Bcc を追加"
                title="Bcc を追加(ほかの宛先に見えない送り先)"
                className={addFieldClass}
              >
                Bcc
              </button>
            )}
          </div>
          {showCc ? (
            <>
              <label htmlFor="cc" className="text-muted">Cc</label>
              <AddressInput
                id="cc"
                name="cc"
                value={cc}
                onChange={(v) => {
                  setCc(v);
                  unconfirm();
                }}
                contacts={contacts}
                className={inputClass}
                // 「Cc」を押して出したときは、そのまま打てるようにする
                autoFocus={start.cc === ""}
              />
            </>
          ) : (
            <input type="hidden" name="cc" value="" />
          )}
          {showBcc ? (
            <>
              <label htmlFor="bcc" className="text-muted" title="ほかの宛先には見えない送り先">
                Bcc
              </label>
              <AddressInput
                id="bcc"
                name="bcc"
                value={bcc}
                onChange={(v) => {
                  setBcc(v);
                  unconfirm();
                }}
                contacts={contacts}
                className={inputClass}
                autoFocus={start.bcc === ""}
              />
            </>
          ) : (
            <input type="hidden" name="bcc" value="" />
          )}
          <label htmlFor="subject" className="text-muted">件名</label>
          <input id="subject" name="subject" value={subject} onChange={(e) => {
              setSubject(e.target.value);
              unconfirm();
            }} className={inputClass} autoComplete="off" />
          {canSuggest || subjects.state.status === "running" || (subjects.state.status === "done" && !subject.trim()) ? (
            <>
              <span aria-hidden="true" />
              <SubjectSuggestions
                state={subjects.state}
                canSuggest={canSuggest}
                onSuggest={suggestSubject}
                onPick={(s) => {
                  setSubject(s);
                  subjects.reset();
                  unconfirm();
                }}
              />
            </>
          ) : null}
        </div>
        <label htmlFor="body" className="sr-only">本文</label>
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            unconfirm();
          }}
          // 件名が空のまま本文を書き終えたら、栞に件名を考えてもらう(同じ本文で何度も頼まない)
          onBlur={() => {
            if (canSuggest && subjects.requestedFor !== ownText.trim()) suggestSubject();
          }}
          rows={16}
          autoFocus={!!replyTo}
          className={`${inputClass} flex-1 text-[15px] leading-relaxed`}
        />
        {defaults.quote ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              {forward ? (
                <span className="text-muted">転送するメール(本文の下に付けます)</span>
              ) : (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeQuote}
                    onChange={(e) => {
                      setIncludeQuote(e.target.checked);
                      unconfirm();
                    }}
                    className="accent-accent"
                  />
                  <span className={includeQuote ? "" : "text-muted"}>元のメールを引用する(本文の下に付けます)</span>
                </label>
              )}
              <DisclosureButton open={quoteOpen} onToggle={() => setQuoteOpen(!quoteOpen)} controls={quoteId} label={forward ? "転送するメール" : "引用"} />
            </div>
            {forward || includeQuote ? <input type="hidden" name="quote" value={defaults.quote} /> : null}
            <pre
              id={quoteId}
              hidden={!quoteOpen}
              className={`max-h-80 overflow-y-auto border-t border-line pt-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words ${
                forward || includeQuote ? "text-muted" : "text-muted line-through opacity-60"
              }`}
            >
              {defaults.quote}
            </pre>
          </div>
        ) : null}
      </section>

      <section aria-label="栞" className="order-2 min-w-0 lg:order-3">
        <div className="flex flex-col gap-4 lg:sticky lg:top-0">
          <SendReview state={review.state} />
          {replyContext ? <ReplyContext {...replyContext} /> : null}
          <fieldset className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5">
            <legend className="sr-only">栞に下書きを頼む</legend>
            <p aria-hidden="true" className="flex items-center gap-1.5 font-medium text-accent [&_svg]:size-4">
              <SparkleIcon />
              栞に下書きを頼む
            </p>
            <textarea
              aria-label="栞への指示"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                // Enter でフォーム全体(=送信)が動かないようにする。改行は Shift+Enter。
                if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
              }}
              rows={3}
              className={`${inputClass} resize-y`}
              placeholder={
                replyTo
                  ? "例: 1つ目の候補日で参加できると伝える"
                  : forward
                    ? "空欄なら、関係者への共有として書きます(例: 金曜までに確認してほしいと添える)"
                    : "例: 来週の打ち合わせの日程を相談したい"
              }
            />
            <div className="flex items-center gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-muted">口調</span>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full min-w-0 rounded-md border border-line bg-panel px-2 py-1.5">
                  {TONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {ai.state.running ? (
                <AquaButton type="button" tone="glass" label="下書きを中止" onClick={ai.stop}>
                  <span aria-hidden="true" className="block size-3.5 animate-pulse rounded-[4px] bg-accent" />
                </AquaButton>
              ) : (
                <AquaButton
                  type="button"
                  tone="jelly"
                  label={!replyTo && !forward && !instruction.trim() ? "下書きを作る(先に指示を書いてください)" : "下書きを作る"}
                  onClick={generate}
                  disabled={!replyTo && !forward && !instruction.trim()}
                >
                  <SparkleIcon />
                </AquaButton>
              )}
            </div>
            <p className="text-xs text-muted">本文欄に書き込むだけで、送信はしません。内容を確かめて直してから送ってください。</p>
            {!ai.state.running && ai.state.meta ? <AiMeta {...ai.state.meta} /> : null}
            {ai.state.error ? <p role="alert" className="text-red-600">{ai.state.error}</p> : null}
          </fieldset>
        </div>
      </section>
    </form>
  );
}

/** 自分で付けたファイルと、画像・PDF・テキストなら中身を見るための URL(blob:) */
type PickedFile = { file: File; preview: string | null };

const revokePreview = (p: PickedFile) => {
  if (p.preview) URL.revokeObjectURL(p.preview);
};

/** 見本を出す画像の種類(新しいタブで開いてよい種類と同じものに限る) */
const isImage = (contentType: string) => contentType.toLowerCase().startsWith("image/") && isPreviewable(contentType);

/** 添付の小さな見本。画像は中身を縮めて、それ以外は拡張子を出す。onOpen があれば、押すと中身を見られる */
function AttachmentThumb({ name, src, onOpen }: { name: string; src: string | null; onOpen?: () => void }) {
  const [failed, setFailed] = useState(false);
  const ext = name.includes(".") ? name.split(".").pop()!.slice(0, 4).toUpperCase() : "";
  const className =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-background text-[10px] font-semibold tracking-wide text-muted [&_svg]:size-4";
  const inner =
    src && !failed ? (
      // blob: の URL も表示するので next/image は使わない
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
    ) : (
      ext || <PaperclipIcon />
    );
  if (!onOpen) return <span aria-hidden="true" className={className}>{inner}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name} の中身を見る`}
      title="中身を見る"
      className={`${className} cursor-zoom-in transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent`}
    >
      {inner}
    </button>
  );
}

function AttachmentName({ name, size }: { name: string; size: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col text-xs">
      <span className="truncate" title={name}>{name}</span>
      <span className="text-[11px] text-muted tabular-nums">{size}</span>
    </span>
  );
}

/** 件名の候補を頼むのは、本文がこの文字数を超えてから(短すぎると用件が読み取れない) */
const SUBJECT_MIN_TEXT = 15;

type SubjectState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; subjects: string[]; error?: string };

/** 件名の候補(/api/ai/subject)を頼む。requestedFor は最後に頼んだ本文 */
function useSubjectSuggestions() {
  const [state, setState] = useState<SubjectState>({ status: "idle" });
  const [requestedFor, setRequestedFor] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const start = async (payload: { to: string; text: string }) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setRequestedFor(payload.text.trim());
    setState({ status: "running" });
    try {
      const res = await fetch("/api/ai/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as SubjectResponse;
      if (controller.current === ac) setState({ status: "done", ...result });
    } catch (e) {
      if (ac.signal.aborted) return;
      setState({ status: "done", subjects: [], error: e instanceof Error ? `通信に失敗しました (${e.message})` : "通信に失敗しました" });
    }
  };
  const reset = () => {
    controller.current?.abort();
    setState({ status: "idle" });
  };
  return { state, start, reset, requestedFor };
}

function SubjectSuggestions({
  state,
  canSuggest,
  onSuggest,
  onPick,
}: {
  state: SubjectState;
  canSuggest: boolean;
  onSuggest: () => void;
  onPick: (subject: string) => void;
}) {
  const chip = "rounded-full border border-accent px-2.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent-soft";
  return (
    <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-xs [&_svg]:size-3.5">
      <span className="flex items-center gap-1 text-accent" aria-hidden="true">
        <SparkleIcon />
      </span>
      {state.status === "running" ? (
        <span className="text-muted">栞が件名を考えています…</span>
      ) : state.status === "done" && state.subjects.length > 0 ? (
        <>
          <span className="text-muted">件名の候補:</span>
          {state.subjects.map((s) => (
            <button key={s} type="button" onClick={() => onPick(s)} className={chip}>
              {s}
            </button>
          ))}
        </>
      ) : state.status === "done" && state.error ? (
        <span role="alert" className="text-red-600">{state.error}</span>
      ) : null}
      {canSuggest && state.status !== "running" ? (
        <button type="button" onClick={onSuggest} className="text-muted underline hover:text-foreground">
          {state.status === "done" ? "考え直してもらう" : "栞に件名を考えてもらう"}
        </button>
      ) : null}
    </div>
  );
}
