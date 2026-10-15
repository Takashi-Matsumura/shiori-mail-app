"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { saveSettingsAction, testRealAccountAction, type ActionState } from "@/app/actions";
import { DisclosureButton } from "@/components/disclosure-button";
import { InfoButton } from "@/components/info-button";

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
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

/** 入力中の URL が保存済みの URL と同じか(保存するときに末尾の / は落とされる) */
const isSaved = (input: string, saved: string) => input.trim().replace(/\/+$/, "") === saved;

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return true;
  }
}

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
}: Props) {
  // アドレスやサーバは人に見られたくない情報なので、設定済みなら畳んでおく。未設定なら入力できるよう開いておく
  const [accountOpen, setAccountOpen] = useState(account === null);
  const accountPanelId = useId();
  // めったに変えないので畳んでおき、使っているサーバとモデルだけを見せる
  const [aiOpen, setAiOpen] = useState(false);
  const aiPanelId = useId();
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
  const external = [baseUrl, embedBaseUrl].some((u) => u.trim() !== "" && !isLoopback(u));
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
            info={<p>メールアドレスとは別のログイン名を使うサービスのときだけ入力します。空欄なら、メールアドレスでログインします。</p>}
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
            info={
              <>
                <p>パスワードは macOS のキーチェーンにだけ保存し、データベースや画面には残しません。</p>
                <p>多くのサービスでは、通常のパスワードではなく「アプリ用パスワード」の発行が必要です。</p>
                <p>接続先かログイン名を変えるときは、パスワードも入れ直してください。入れ直すまで、設定は保存されません。</p>
              </>
            }
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
              info={<p>メールを受け取る IMAP サーバのホスト名です。http:// などは付けずに入力します。</p>}
            />
            <Field label="ポート" name="realImapPort" defaultValue={String(rf.imapPort)} inputMode="numeric" info={PORT_INFO} />
            <Field
              label="送信サーバ"
              name="realSmtpHost"
              defaultValue={rf.smtpHost}
              placeholder="smtp.example.com"
              info={<p>メールを送る SMTP サーバのホスト名です。http:// などは付けずに入力します。</p>}
            />
            <Field label="ポート" name="realSmtpPort" defaultValue={String(rf.smtpPort)} inputMode="numeric" info={PORT_INFO} />
          </div>
          <Check
            boxed
            label="読み取り専用モード"
            name="realReadOnly"
            defaultChecked={rf.readOnly}
            info={
              <>
                <p>このアプリを試すときのための設定です。</p>
                <p>サーバのメールボックスに一切書き込みません。メールは取り込むだけでサーバに残り、既読・未読はこのアプリの中だけで記録します(ふだんのメールアプリでは未読のまま)。送信もしません。</p>
                <p>外すと、アプリの中だけの既読・未読はその場で捨て、次の同期でサーバの状態に戻ります。</p>
              </>
            }
          />
          <Field
            label="送信済みフォルダ名"
            info={<p>入力は任意です。空欄なら、サーバが「送信済み」として示しているフォルダを探して使います。</p>}
            name="realSentMailbox"
            defaultValue={rf.sentMailbox}
            placeholder="空欄ならサーバの「送信済み」属性から探します"
          />
          <Check
            label="送信したメールの控えを送信済みフォルダに保存する"
            name="realAppendSent"
            defaultChecked={rf.appendSent}
            info={<p>Gmail はサーバが自動で保存するので、外さないと控えが二重になります。</p>}
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
              <InfoButton title="接続を確かめる">
                <p>入力した内容で IMAP と SMTP にログインできるかを試します。メールは送りません。</p>
              </InfoButton>
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
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            このマシンの外の URL が含まれています。要約や検索のたびに、メールの本文がその宛先へ送信されます。
          </p>
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
            info={
              <>
                <p>要約や仕分けに使う、ローカルの AI サーバの URL です。OpenAI 互換 API のベース URL を指定します。よく使うサーバの既定の URL は次のとおりです。</p>
                <ul className="list-disc pl-5 font-mono text-xs">
                  <li>llama-server: http://localhost:8080/v1</li>
                  <li>LM Studio: http://localhost:1234/v1</li>
                  <li>Ollama: http://localhost:11434/v1</li>
                </ul>
                <p>URL を変えると、モデル一覧も更新されます。</p>
                <StatusHelp />
              </>
            }
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
            info={
              <>
                <p>空欄なら、上の AI サーバをそのまま使います。</p>
                <p>llama-server はモデルごとにサーバが分かれるので、埋め込みモデルのサーバを別に指定します(例: http://localhost:8082/v1)。</p>
                <StatusHelp />
                <p>空欄のときは上の AI サーバを使うので、この欄には印を出しません。</p>
              </>
            }
          />
          <ModelField
            name="aiChatModel"
            label="会話用モデル"
            value={ai.chatModel}
            options={chatModels}
            info={<p>要約・返信の下書き・仕分け・予定の抜き出しに使うモデルです。「自動」なら、一覧の先頭のモデルを使います。</p>}
          />
          <Check
            label="回答の前にモデルに考えさせる"
            name="aiThinking"
            defaultChecked={ai.thinking}
            info={
              <p>
                「思考モード」と呼ばれる機能で、対応しているモデルでだけ働きます。判断は丁寧になりますが、1 通あたりの待ち時間が数倍〜数十倍に延びます。速さと質の違いを比べる実験用です。
              </p>
            }
          />
          <Check
            label="仕分けは、まず似たメールの仕分けから推定する"
            name="aiClassifyKnn"
            defaultChecked={ai.classifyKnn}
            info={
              <>
                <p>
                  「近傍法」と呼ばれる方法です。検索用の埋め込みを使い、1 通あたり数ミリ秒で仕分けます。似たメールの仕分けが割れているときや、見たことのない種類のメールだけ、会話用モデルに聞きます。
                </p>
                <p>
                  手本になるのは会話用モデルの判定と、あなたが確定した仕分けです(仕分け済みが 20 通に満たないうちは、すべて会話用モデルに聞きます)。
                </p>
              </>
            }
          />
          <ModelField
            name="aiEmbedModel"
            label="埋め込み用モデル"
            value={ai.embedModel}
            options={embedModels}
            info={
              <>
                <p>意味検索(言葉が違っても内容の近いメールを探す検索)と、近傍法の仕分けに使うモデルです。</p>
                <p>埋め込み用モデルを変えたら、検索画面で索引を作り直す必要があります(モデルが違うベクトル同士は比べられません)。</p>
              </>
            }
          />
        </div>
      </fieldset>
    </form>
  );
}

const PORT_INFO = (
  <p>
    IMAP 993・SMTP 465 は最初から暗号化して接続します。それ以外のポート(SMTP 587 など)では STARTTLS
    を必須にし、暗号化できなければパスワードを送らずに止めます。
  </p>
);

/** 項目名と、説明があればその ⓘ。ⓘ は <label> の外に置く(中に置くと、項目名を押したときの動きが変わる) */
function FieldLabel({
  htmlFor,
  label,
  info,
  status,
}: {
  htmlFor: string;
  label: string;
  info?: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <label htmlFor={htmlFor}>{label}</label>
      {info ? <InfoButton title={label}>{info}</InfoButton> : null}
      {status}
    </span>
  );
}

/** URL 欄の ⓘ で、項目名の横の印の見方を説明する */
function StatusHelp() {
  return (
    <>
      <p>項目名の横の印は、保存済みの URL に接続できたかを表します(設定画面を開いたときと、保存したときに確かめます)。</p>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center gap-1.5">
          <ConnectionStatus error={null} />
          接続できています。
        </li>
        <li className="flex items-start gap-1.5">
          <ConnectionStatus error="接続できません" />
          <span>接続できません。理由は URL 欄のすぐ下に赤字で出ます。サーバが起動しているか、URL が正しいかを確かめてください。</span>
        </li>
      </ul>
      <p>URL を書き換えている間は印を消し、欄を離れて保存したあとに確かめ直します。</p>
    </>
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
  info?: React.ReactNode;
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
  info?: React.ReactNode;
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
  info?: React.ReactNode;
  /** 目立たせたい項目は枠で囲む */
  boxed?: boolean;
}) {
  return (
    <div className={`flex items-start gap-1 ${boxed ? "rounded-md border border-line bg-background p-3" : ""}`}>
      <label className="flex items-start gap-2">
        <input type="checkbox" name={name} value="on" defaultChecked={defaultChecked} className="mt-1" />
        <span>{label}</span>
      </label>
      {info ? <InfoButton title={label}>{info}</InfoButton> : null}
    </div>
  );
}
