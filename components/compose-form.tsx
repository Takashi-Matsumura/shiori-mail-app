"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { sendAction, type SendState } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { AquaButton } from "@/components/aqua-button";
import { SendReview } from "@/components/send-review";
import { CheckIcon, CloseIcon, SentIcon, SparkleIcon } from "@/components/icons";
import { TONES } from "@/lib/ai/prompts";
import { useNotices } from "@/lib/client/notices";
import { useAiStream } from "@/lib/client/use-ai-stream";
import { useSendReview } from "@/lib/client/use-send-review";

type Props = {
  defaults: { to: string; cc: string; subject: string; body: string; inReplyTo: string; references: string };
  replyTo: { id: number; subject: string; from: string } | null;
  account: { email: string; name: string; readOnly: boolean };
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

export function ComposeForm({ defaults, replyTo, account }: Props) {
  const router = useRouter();
  const { notify } = useNotices();
  // 送れたら、結果はヘッダーのお知らせで伝えて一覧へ戻る。遷移もアクションの中で行い、戻るまで「送信中…」のままにする。
  const [state, action, pending] = useActionState<SendState, FormData>(async (prev, formData) => {
    const next = await sendAction(prev, formData);
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
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState(defaults.cc);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  // 送信前の確認。チェックを入れたら栞が見直す。どこかを書き換えたら、確認し直してもらうために外す。
  const [confirmed, setConfirmed] = useState(false);
  // 見直しの終わりを待たずに送ることにしたか
  const [skipReview, setSkipReview] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]);
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
    if (body.trim()) review.start({ to, cc, subject, text: body, replyTo: replyTo?.id });
  };

  const cancel = () => {
    const edited = to !== defaults.to || cc !== defaults.cc || subject !== defaults.subject || body !== defaults.body;
    if (edited && !window.confirm("書きかけの内容を破棄して戻りますか？")) return;
    ai.stop();
    // 開いてきた画面(一覧や返信元のメール)へ戻す。URL を直接開いたときは戻り先がないので受信トレイへ。
    if (window.history.length > 1) router.back();
    else router.push("/mail/inbox");
  };

  const generate = () => {
    // 下書きは本文の先頭(引用の上)に流し込む。前回の下書きがあれば置き換える。
    const rest = defaults.body && body.endsWith(defaults.body) ? defaults.body : "";
    let draft = "";
    unconfirm();
    setBody(rest);
    ai.run("/api/ai/draft", { replyTo: replyTo?.id, instruction, tone }, (delta) => {
      draft += delta;
      setBody(draft + rest);
    });
  };

  // 左に操作(送信・キャンセル)、真ん中にメール、右に栞(AI)。狭い画面では メール → 栞 → 操作 の順に縦へ積む。
  return (
    <form
      action={action}
      className="mx-auto grid min-h-full max-w-7xl grid-cols-1 gap-6 p-6 lg:grid-cols-[12rem_minmax(0,1fr)_18rem]"
    >
      <input type="hidden" name="inReplyTo" value={defaults.inReplyTo} />
      <input type="hidden" name="references" value={defaults.references} />

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
                  <dd className="break-all font-medium">{to || <span className="font-normal text-muted">未入力</span>}</dd>
                </div>
                {cc ? (
                  <div>
                    <dt className="text-muted">Cc</dt>
                    <dd className="break-all font-medium">{cc}</dd>
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
        </div>
      </section>

      <section aria-label="メール" className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
        <div>
          <h1 className="text-xl font-semibold">{replyTo ? "返信" : "新規作成"}</h1>
          {replyTo ? <p className="text-muted">{replyTo.from} さんの「{replyTo.subject}」への返信</p> : null}
        </div>
        <div className="grid grid-cols-[4rem_1fr] items-center gap-x-2 gap-y-2">
          <span className="text-muted">差出人</span>
          <span>{account.name ? `${account.name} <${account.email}>` : account.email}</span>
          <label htmlFor="to" className="text-muted">宛先</label>
          <input id="to" name="to" value={to} onChange={(e) => {
              setTo(e.target.value);
              unconfirm();
            }} className={inputClass} placeholder="someone@example.com" autoComplete="off" />
          <label htmlFor="cc" className="text-muted">Cc</label>
          <input id="cc" name="cc" value={cc} onChange={(e) => {
              setCc(e.target.value);
              unconfirm();
            }} className={inputClass} autoComplete="off" />
          <label htmlFor="subject" className="text-muted">件名</label>
          <input id="subject" name="subject" value={subject} onChange={(e) => {
              setSubject(e.target.value);
              unconfirm();
            }} className={inputClass} autoComplete="off" />
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
          rows={16}
          className={`${inputClass} flex-1 font-mono leading-relaxed`}
        />
      </section>

      <section aria-label="栞" className="order-2 min-w-0 lg:order-3">
        <div className="flex flex-col gap-4 lg:sticky lg:top-0">
          <SendReview state={review.state} />
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
              placeholder={replyTo ? "例: 1つ目の候補日で参加できると伝える" : "例: 来週の打ち合わせの日程を相談したい"}
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
                  label={!replyTo && !instruction.trim() ? "下書きを作る(先に指示を書いてください)" : "下書きを作る"}
                  onClick={generate}
                  disabled={!replyTo && !instruction.trim()}
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
