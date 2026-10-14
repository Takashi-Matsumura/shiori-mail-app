"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendAction, type SendState } from "@/app/actions";
import { AiMeta } from "@/components/ai-meta";
import { TONES } from "@/lib/ai/prompts";
import { useAiStream } from "@/lib/client/use-ai-stream";

type Props = {
  defaults: { to: string; cc: string; subject: string; body: string; inReplyTo: string; references: string };
  replyTo: { id: number; subject: string; from: string } | null;
  account: { email: string; name: string; isLocal: boolean; readOnly: boolean };
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

export function ComposeForm({ defaults, replyTo, account }: Props) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendAction, null);
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState(defaults.cc);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]);
  const ai = useAiStream();

  const generate = () => {
    // 下書きは本文の先頭(引用の上)に流し込む。前回の下書きがあれば置き換える。
    const rest = defaults.body && body.endsWith(defaults.body) ? defaults.body : "";
    let draft = "";
    setBody(rest);
    ai.run("/api/ai/draft", { replyTo: replyTo?.id, instruction, tone }, (delta) => {
      draft += delta;
      setBody(draft + rest);
    });
  };

  if (state?.ok) {
    const r = state.result;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        <h1 className="text-xl font-semibold">送信しました</h1>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-panel p-4">
          <dt className="text-muted">宛先</dt>
          <dd>{state.to}</dd>
          <dt className="text-muted">サーバの応答</dt>
          <dd className="font-mono text-xs">{r.response}</dd>
          <dt className="text-muted">受理された宛先</dt>
          <dd>{r.accepted.join(", ") || "なし"}</dd>
          {r.rejected.length > 0 ? (
            <>
              <dt className="text-muted">拒否された宛先</dt>
              <dd className="text-red-600">{r.rejected.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted">Message-ID</dt>
          <dd className="break-all font-mono text-xs">{r.messageId}</dd>
          <dt className="text-muted">送信済みへの控え</dt>
          <dd>
            {r.appended === true
              ? "IMAP の APPEND で保存しました"
              : r.appended === false
                ? "保存に失敗しました(送信自体は完了しています)"
                : "サーバが自動で保存する設定のため、こちらからは保存していません"}
          </dd>
        </dl>
        <p className="text-muted">
          「受理」は SMTP サーバが配送を引き受けたという意味で、相手に届いたことまでは保証しません。
        </p>
        <div className="flex gap-3">
          <Link href="/mail/sent" className="text-accent underline">送信済みを見る</Link>
          <Link href="/inspector" className="text-accent underline">SMTP のやり取りを見る</Link>
          <Link href="/mail/inbox" className="text-accent underline">受信トレイへ戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">{replyTo ? "返信" : "新規作成"}</h1>
      {replyTo ? <p className="text-muted">{replyTo.from} さんの「{replyTo.subject}」への返信</p> : null}
      <input type="hidden" name="inReplyTo" value={defaults.inReplyTo} />
      <input type="hidden" name="references" value={defaults.references} />

      <div className="grid grid-cols-[4rem_1fr] items-center gap-x-2 gap-y-2">
        <span className="text-muted">差出人</span>
        <span>{account.name ? `${account.name} <${account.email}>` : account.email}</span>
        <label htmlFor="to" className="text-muted">宛先</label>
        <input id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} placeholder="someone@example.test" autoComplete="off" />
        <label htmlFor="cc" className="text-muted">Cc</label>
        <input id="cc" name="cc" value={cc} onChange={(e) => setCc(e.target.value)} className={inputClass} autoComplete="off" />
        <label htmlFor="subject" className="text-muted">件名</label>
        <input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} autoComplete="off" />
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
        <legend className="px-1 font-medium">AI で下書き</legend>
        <div className="flex gap-2">
          <input
            aria-label="AI への指示"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              // Enter でフォーム全体(=送信)が動かないようにする
              if (e.key === "Enter") e.preventDefault();
            }}
            className={inputClass}
            placeholder={replyTo ? "例: 1つ目の候補日で参加できると伝える" : "例: 来週の打ち合わせの日程を相談したい"}
          />
          <select aria-label="口調" value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-md border border-line bg-panel px-2">
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {ai.state.running ? (
            <button type="button" onClick={ai.stop} className="shrink-0 rounded-md border border-line px-3 py-1.5">
              中止
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!replyTo && !instruction.trim()}
              className="shrink-0 rounded-md border border-accent px-3 py-1.5 text-accent hover:bg-accent-soft disabled:border-line disabled:text-muted"
            >
              下書きを作る
            </button>
          )}
        </div>
        <p className="text-xs text-muted">本文欄に書き込むだけで、送信はしません。内容を確かめて直してから送ってください。</p>
        {!ai.state.running && ai.state.meta ? <AiMeta {...ai.state.meta} /> : null}
        {ai.state.error ? <p role="alert" className="text-red-600">{ai.state.error}</p> : null}
      </fieldset>

      <label htmlFor="body" className="sr-only">本文</label>
      <textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={16} className={`${inputClass} font-mono leading-relaxed`} />

      {account.readOnly ? (
        <p className="rounded-lg border border-line bg-background p-3 text-sm">
          読み取り専用モードなので送信できません。下書きと AI アシストは使えます。送るときは設定画面でモードを外してください。
        </p>
      ) : !account.isLocal ? (
        <label className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          <input type="checkbox" name="confirmReal" value="yes" className="mt-0.5" />
          <span>
            実アカウント({account.email})から <strong>{to || "(宛先未入力)"}</strong>
            {cc ? <> と Cc の <strong>{cc}</strong></> : null} へ、実際にメールを送信します。
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted">テストサーバ宛です。どのアドレスに送っても外部には配送されません。自分({account.email})宛に送ると受信トレイに届きます。</p>
      )}

      {state && !state.ok ? <p role="alert" className="text-red-600">{state.message}</p> : null}
      <div>
        <button disabled={pending || ai.state.running || account.readOnly} className="rounded-md bg-accent px-4 py-2 font-medium text-panel hover:opacity-90 disabled:opacity-60">
          {pending ? "送信中…" : "送信"}
        </button>
      </div>
    </form>
  );
}
