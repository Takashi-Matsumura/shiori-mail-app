"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { saveSettingsAction, testRealAccountAction, type ActionState } from "@/app/actions";
import { DisclosureButton } from "@/components/disclosure-button";
import { InfoButton } from "@/components/info-button";
import { isLoopbackUrl, isNewExternalUrl } from "@/lib/ai/loopback";
import { HELP } from "@/lib/help-texts";

type AccountInfo = { email: string; servers: string };

type Props = {
  /** 設定済みのアカウント。未設定なら null */
  account: AccountInfo | null;
  realFields: {
    email: string;
    name: string;
    user: string;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    sentMailbox: string;
    appendSent: boolean;
    readOnly: boolean;
  };
  passwordSource: "keychain" | "env" | "none";
  keychainAvailable: boolean;
  ai: { baseUrl: string; embedBaseUrl: string; chatModel: string; embedModel: string; thinking: boolean; classifyKnn: boolean };
  defaultBaseUrl: string;
  chatModels: string[];
  embedModels: string[];
  chatError: string | null;
  embedError: string | null;
  /** いま会話に使うサーバとモデル(「自動」なら一覧の先頭)。畳んだ欄に出す */
  inUse: { server: string; model: string };
  signature: string;
  forwardIntro: string;
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

/** 入力中の URL が保存済みの URL と同じか(保存するときに末尾の / は落とされる) */
const isSaved = (input: string, saved: string) => input.trim().replace(/\/+$/, "") === saved;

export function SettingsForm({
  account,
  realFields: rf,
  passwordSource,
  keychainAvailable,
  ai,
  defaultBaseUrl,
  chatModels,
  embedModels,
  chatError,
  embedError,
  inUse,
  signature,
  forwardIntro,
}: Props) {
  // アドレスやサーバは人に見られたくない情報なので、設定済みなら畳んでおく。未設定なら入力できるよう開いておく
  const [accountOpen, setAccountOpen] = useState(account === null);
  const accountPanelId = useId();
  // めったに変えないので畳んでおき、使っているサーバとモデルだけを見せる
  const [aiOpen, setAiOpen] = useState(false);
  const aiPanelId = useId();
  const signatureId = useId();
  const forwardIntroId = useId();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveSettingsAction(prev, formData);
    // 入力の誤りがある欄を、直せるように開く
    if (result && !result.ok) {
      if (result.section === "ai") setAiOpen(true);
      else setAccountOpen(true);
    }
    return result;
  }, null);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [embedBaseUrl, setEmbedBaseUrl] = useState(ai.embedBaseUrl);
  // 入力途中の不完全な URL では警告を出さない
  const external = [baseUrl, embedBaseUrl].some((u) => URL.canParse(u.trim()) && !isLoopbackUrl(u.trim()));
  // いま使っている URL から外へ新しく切り替えるときだけ、同意を求める(サーバも同じ条件で確かめる)
  const needsConsent = isNewExternalUrl(baseUrl, ai.baseUrl) || isNewExternalUrl(embedBaseUrl, ai.embedBaseUrl);
  const [test, runTest, testing] = useActionState<ActionState, FormData>((_prev, formData) => testRealAccountAction(formData), null);
  const formRef = useRef<HTMLFormElement>(null);
  // 文字の入力は、1 文字ごとではなく欄を離れたときに保存する(書きかけのホスト名などを保存しないため)
  const dirty = useRef(false);
  const save = (extra?: Record<string, string>) => {
    if (!formRef.current) return;
    dirty.current = false;
    const formData = new FormData(formRef.current);
    for (const [key, value] of Object.entries(extra ?? {})) formData.set(key, value);
    startTransition(() => action(formData));
  };
  const [confirmForget, setConfirmForget] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  // 保存できたら、入力したパスワードを画面から消す
  useEffect(() => {
    if (state?.ok && passwordRef.current) passwordRef.current.value = "";
  }, [state]);

  return (
    <form
      ref={formRef}
      // 保存ボタンは置かず、変えたところから自動で保存する。
      // action={...} だと送信のたびに入力欄が初期値へ戻り、入力の誤りを直す前に全部消えてしまうので、FormData を自分で作って渡す
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onChange={(e) => {
        const target: EventTarget = e.target;
        // チェックボックスと選択肢は、選んだ時点で値が決まるのですぐ保存する
        if ((target instanceof HTMLInputElement && target.type === "checkbox") || target instanceof HTMLSelectElement) save();
        else dirty.current = true;
      }}
      onBlur={() => {
        if (dirty.current) save();
      }}
      className="flex flex-col gap-6"
    >
      <p role="status" className={`-mt-2 text-xs ${state && !state.ok && !pending ? "text-red-600" : "text-muted"}`}>
        {pending ? "保存中…" : state ? state.message : "変更は自動で保存します。"}
      </p>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-5">
        <legend className="px-1 font-semibold">メールアカウント</legend>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {!account
              ? "未設定です。下の欄を埋めると使えます。"
              : accountOpen
                ? `${account.email} ・ ${account.servers}`
                : // 畳んでいる間も、どのアカウントかだけは分かるようにする(サーバなどは隠す)
                  account.email}
          </p>
          <DisclosureButton
            open={accountOpen}
            onToggle={() => setAccountOpen(!accountOpen)}
            controls={accountPanelId}
            label="メールアカウント"
          />
        </div>

        {/* 畳んでも入力欄は残す(取り除くと、保存したときにアカウントの設定が空で上書きされる) */}
        <div id={accountPanelId} hidden={!accountOpen} className="mt-3 flex flex-col gap-5">
          <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
            <Field label="メールアドレス" name="realEmail" defaultValue={rf.email} type="email" placeholder="you@example.com" />
            <Field label="表示名" name="realName" defaultValue={rf.name} placeholder="山田 太郎" />
          </div>
          <Field
            label="ログイン名"
            info={HELP.loginName}
            name="realUser"
            defaultValue={rf.user}
            placeholder="空欄ならメールアドレスを使います"
          />
          <Field
            ref={passwordRef}
            label="パスワード"
            name="realPassword"
            type="password"
            autoComplete="new-password"
            disabled={!keychainAvailable}
            placeholder={passwordSource === "none" ? "アプリ用パスワード" : "保存済み(変えるときだけ入力)"}
            info={HELP.password}
            // いまパスワードがどこにあるかは状態なので、説明とは分けて常に見せる
            note={
              !keychainAvailable
                ? "パスワードの保存先(キーチェーン)は macOS でだけ使えます。"
                : passwordSource === "keychain"
                  ? "macOS のキーチェーンに保存済みです。"
                  : passwordSource === "env"
                    ? ".env.local の REAL_MAIL_PASSWORD を使っています。ここに入力すると、キーチェーンに保存したものが優先されます。"
                    : "まだ保存されていません。"
            }
          />
          {/* 自動保存なので、押し間違いで消えないよう、もう一度確かめてから消す */}
          {passwordSource === "keychain" ? (
            confirmForget ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>キーチェーンからパスワードを消しますか？</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmForget(false);
                    save({ realForgetPassword: "on" });
                  }}
                  className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                >
                  消す
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmForget(false)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background"
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmForget(true)}
                className="self-start rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background"
              >
                キーチェーンからパスワードを消す
              </button>
            )
          ) : null}
          <div className="grid gap-x-3 gap-y-5 sm:grid-cols-[1fr_7rem]">
            <Field
              label="受信サーバ"
              name="realImapHost"
              defaultValue={rf.imapHost}
              placeholder="imap.example.com"
              info={HELP.imapHost}
            />
            <Field label="ポート" name="realImapPort" defaultValue={String(rf.imapPort)} inputMode="numeric" info={HELP.port} />
            <Field
              label="送信サーバ"
              name="realSmtpHost"
              defaultValue={rf.smtpHost}
              placeholder="smtp.example.com"
              info={HELP.smtpHost}
            />
            <Field label="ポート" name="realSmtpPort" defaultValue={String(rf.smtpPort)} inputMode="numeric" info={HELP.port} />
          </div>
          <Check
            boxed
            label="読み取り専用モード"
            name="realReadOnly"
            defaultChecked={rf.readOnly}
            info={HELP.readOnly}
          />
          <Field
            label="送信済みフォルダ名"
            info={HELP.sentMailbox}
            name="realSentMailbox"
            defaultValue={rf.sentMailbox}
            placeholder="空欄ならサーバの「送信済み」属性から探します"
          />
          <Check
            label="送信したメールの控えを送信済みフォルダに保存する"
            name="realAppendSent"
            defaultChecked={rf.appendSent}
            info={HELP.saveSentCopy}
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={testing}
                onClick={() => {
                  if (!formRef.current) return;
                  const formData = new FormData(formRef.current);
                  startTransition(() => runTest(formData));
                }}
                className="self-start rounded-md border border-line px-3 py-1.5 hover:bg-background disabled:opacity-60"
              >
                {testing ? "確かめています…" : "接続を確かめる"}
              </button>
              <InfoButton title="接続を確かめる" markdown={HELP.testConnection} />
            </div>
            {test ? (
              <p role="status" className={`whitespace-pre-line ${test.ok ? "text-muted" : "text-red-600"}`}>
                {test.message}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-5">
        <legend className="px-1 font-semibold">ローカル AI</legend>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted">
            {chatError ? (
              <span className="text-red-600">AI サーバに接続できません</span>
            ) : (
              `${inUse.server}(${inUse.model || "モデルなし"})`
            )}
          </p>
          <DisclosureButton open={aiOpen} onToggle={() => setAiOpen(!aiOpen)} controls={aiPanelId} label="ローカル AI" />
        </div>

        {/* メール本文が外へ出る警告なので、畳んでいても見せる */}
        {external ? (
          <div role="alert" className="flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <p>
              このマシンの外の URL が含まれています。要約や検索のたびに、また自動処理では新着のたびに、メールの本文がその宛先へ送信されます。
            </p>
            {needsConsent ? (
              <label className="flex items-start gap-2 font-medium">
                <input type="checkbox" name="aiExternalConsent" value="on" className="mt-1" />
                <span>メールの本文がこの宛先へ送られることに同意する</span>
              </label>
            ) : null}
          </div>
        ) : null}

        {/* 畳んでも入力欄は残す(取り除くと、保存したときに AI の設定が空で上書きされる) */}
        <div id={aiPanelId} hidden={!aiOpen} className="mt-3 flex flex-col gap-5">
          <Field
            label="AI サーバの URL"
            // 確かめたのは保存済みの URL なので、書き換えている間は結果を出さない
            status={isSaved(baseUrl, ai.baseUrl) ? <ConnectionStatus error={chatError} /> : null}
            error={isSaved(baseUrl, ai.baseUrl) ? chatError : null}
            name="aiBaseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={defaultBaseUrl}
            info={HELP.aiBaseUrl}
          />
          <Field
            label="埋め込み用サーバの URL"
            // 空欄なら上と同じサーバなので、上の結果で足りる
            status={embedBaseUrl.trim() && isSaved(embedBaseUrl, ai.embedBaseUrl) ? <ConnectionStatus error={embedError} /> : null}
            error={isSaved(embedBaseUrl, ai.embedBaseUrl) ? embedError : null}
            name="aiEmbedBaseUrl"
            value={embedBaseUrl}
            onChange={(e) => setEmbedBaseUrl(e.target.value)}
            placeholder="空欄なら上と同じサーバ"
            info={HELP.aiEmbedBaseUrl}
          />
          <ModelField
            name="aiChatModel"
            label="会話用モデル"
            value={ai.chatModel}
            options={chatModels}
            info={HELP.chatModel}
          />
          <Check
            label="回答の前にモデルに考えさせる"
            name="aiThinking"
            defaultChecked={ai.thinking}
            info={HELP.thinking}
          />
          <Check
            label="仕分けは、まず似たメールの仕分けから推定する"
            name="aiClassifyKnn"
            defaultChecked={ai.classifyKnn}
            info={HELP.classifyKnn}
          />
          <ModelField
            name="aiEmbedModel"
            label="埋め込み用モデル"
            value={ai.embedModel}
            options={embedModels}
            info={HELP.embedModel}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-5">
        <legend className="px-1 font-semibold">メールの作成</legend>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={signatureId} label="署名" info={HELP.signature} />
          <textarea
            id={signatureId}
            name="signature"
            defaultValue={signature}
            rows={5}
            maxLength={2000}
            placeholder={"山田 太郎\n株式会社〇〇 営業部\nyamada@example.com"}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={forwardIntroId} label="転送の書き出し" info={HELP.forwardIntro} />
          <textarea
            id={forwardIntroId}
            name="forwardIntro"
            defaultValue={forwardIntro}
            rows={4}
            maxLength={2000}
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>
      </fieldset>
    </form>
  );
}

/** 項目名と、説明があればその ⓘ。ⓘ は <label> の外に置く(中に置くと、項目名を押したときの動きが変わる) */
function FieldLabel({
  htmlFor,
  label,
  info,
  status,
}: {
  htmlFor: string;
  label: string;
  info?: string;
  status?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={htmlFor}>{label}</label>
      {info ? <InfoButton title={label} markdown={info} /> : null}
      {status}
    </span>
  );
}

/** 接続できたかを、色と形(チェック / びっくりマーク)で示す。色だけに頼らないよう形も変える */
function ConnectionStatus({ error }: { error: string | null }) {
  const text = error ? "接続できません" : "接続できています";
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={`inline-flex shrink-0 p-0.5 ${error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" />
        {error ? (
          <>
            <path d="M12 7v6" />
            <path d="M12 16.5h.01" />
          </>
        ) : (
          <path d="m8 12.5 2.8 2.8L16.5 9.5" />
        )}
      </svg>
    </span>
  );
}

function ModelField({
  name,
  label,
  value,
  options,
  info,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
  info?: string;
}) {
  const id = useId();
  // 一覧に無い設定済みの値(接続できないときなど)も選択肢に残す
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} label={label} info={info} />
      <select id={id} name={name} defaultValue={value} className={inputClass}>
        <option value="">自動(一覧の先頭を使う)</option>
        {all.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function Field({
  label,
  info,
  status,
  note,
  error,
  ...input
}: {
  label: string;
  name: string;
  info?: string;
  /** 項目名の横に出す状態のアイコン */
  status?: React.ReactNode;
  note?: string;
  error?: string | null;
} & React.ComponentProps<"input">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} label={label} info={info} status={status} />
      <input autoComplete="off" {...input} id={id} className={inputClass} />
      {note ? <span className="text-xs text-muted">{note}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Check({
  label,
  name,
  defaultChecked,
  info,
  boxed = false,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
  info?: string;
  /** 目立たせたい項目は枠で囲む */
  boxed?: boolean;
}) {
  return (
    <div className={`flex items-start gap-1 ${boxed ? "rounded-md border border-line bg-background p-3" : ""}`}>
      <label className="flex items-start gap-2">
        <input type="checkbox" name={name} value="on" defaultChecked={defaultChecked} className="mt-1" />
        <span>{label}</span>
      </label>
      {info ? <InfoButton title={label} markdown={info} /> : null}
    </div>
  );
}
