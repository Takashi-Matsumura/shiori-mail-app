"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { saveSettingsAction, testRealAccountAction, type ActionState } from "@/app/actions";

type AccountInfo = { email: string; servers: string };

type Props = {
  activeAccount: "local" | "real";
  local: AccountInfo;
  real: AccountInfo | null;
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
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return true;
  }
}

export function SettingsForm({
  activeAccount,
  local,
  real,
  realFields: rf,
  passwordSource,
  keychainAvailable,
  ai,
  defaultBaseUrl,
  chatModels,
  embedModels,
  chatError,
  embedError,
}: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettingsAction, null);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [embedBaseUrl, setEmbedBaseUrl] = useState(ai.embedBaseUrl);
  const external = [baseUrl, embedBaseUrl].some((u) => u.trim() !== "" && !isLoopback(u));
  const [test, runTest, testing] = useActionState<ActionState, FormData>((_prev, formData) => testRealAccountAction(formData), null);
  const formRef = useRef<HTMLFormElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // 保存できたら、入力したパスワードを画面から消す
  useEffect(() => {
    if (state?.ok && passwordRef.current) passwordRef.current.value = "";
  }, [state]);

  return (
    <form
      ref={formRef}
      // action={...} だと送信のたびに入力欄が初期値へ戻り、入力の誤りを直す前に全部消えてしまう
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="flex flex-col gap-5"
    >
      <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
        <legend className="px-1 font-semibold">メールアカウント</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="account" value="local" defaultChecked={activeAccount === "local"} className="mt-1" />
          <span>
            ローカル テストサーバ({local.email})
            <span className="block text-xs text-muted">{local.servers} ・ 外部には配送されません</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="account" value="real" defaultChecked={activeAccount === "real"} className="mt-1" />
          <span>
            実アカウント{real ? `(${real.email})` : "(未設定)"}
            <span className="block text-xs text-muted">
              {real ? `${real.servers} ・ 送信すると実際に相手へ届きます` : "下の欄を埋めて保存すると使えます"}
            </span>
          </span>
        </label>

        <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
          <p className="font-medium">実アカウントの設定</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="メールアドレス" name="realEmail" defaultValue={rf.email} type="email" placeholder="you@example.com" />
            <Field label="表示名" name="realName" defaultValue={rf.name} placeholder="山田 太郎" />
          </div>
          <Field
            label="ログイン名(アドレスと違う場合だけ)"
            name="realUser"
            defaultValue={rf.user}
            placeholder="空欄ならメールアドレスを使います"
          />
          <label className="flex flex-col gap-1">
            <span>パスワード</span>
            <input
              ref={passwordRef}
              name="realPassword"
              type="password"
              autoComplete="new-password"
              disabled={!keychainAvailable}
              placeholder={passwordSource === "none" ? "アプリ用パスワード" : "保存済み(変えるときだけ入力)"}
              className={inputClass}
            />
            <span className="text-xs text-muted">
              {!keychainAvailable
                ? "パスワードの保存先(キーチェーン)は macOS でだけ使えます。"
                : passwordSource === "keychain"
                  ? "macOS のキーチェーンに保存済みです。"
                  : passwordSource === "env"
                    ? ".env.local の REAL_MAIL_PASSWORD を使っています。ここに入力すると、キーチェーンに保存したものが優先されます。"
                    : "まだ保存されていません。"}{" "}
              接続先かログイン名を変えるときは、パスワードも入れ直してください。
            </span>
          </label>
          {passwordSource === "keychain" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="realForgetPassword" value="on" />
              キーチェーンからパスワードを消す
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <Field label="IMAP サーバ(受信)" name="realImapHost" defaultValue={rf.imapHost} placeholder="imap.example.com" />
            <Field label="ポート" name="realImapPort" defaultValue={String(rf.imapPort)} inputMode="numeric" />
            <Field label="SMTP サーバ(送信)" name="realSmtpHost" defaultValue={rf.smtpHost} placeholder="smtp.example.com" />
            <Field label="ポート" name="realSmtpPort" defaultValue={String(rf.smtpPort)} inputMode="numeric" />
          </div>
          <p className="text-xs text-muted">
            IMAP 993・SMTP 465 は最初から暗号化して接続します。それ以外のポート(SMTP 587 など)では STARTTLS
            を必須にし、暗号化できなければパスワードを送らずに止めます。
          </p>
          <label className="flex items-start gap-2 rounded-md border border-line bg-background p-3">
            <input type="checkbox" name="realReadOnly" value="on" defaultChecked={rf.readOnly} className="mt-1" />
            <span>
              読み取り専用モード(検証用)
              <span className="block text-xs text-muted">
                サーバのメールボックスに一切書き込みません。メールは取り込むだけでサーバに残り、既読・未読はこのアプリの中だけで記録します(ふだんのメールアプリでは未読のまま)。送信もしません。外すと、アプリの中だけの既読・未読は捨て、次の同期でサーバの状態に戻ります。
              </span>
            </span>
          </label>
          <Field
            label="送信済みフォルダ名(任意)"
            name="realSentMailbox"
            defaultValue={rf.sentMailbox}
            placeholder="空欄ならサーバの「送信済み」属性から探します"
          />
          <label className="flex items-start gap-2">
            <input type="checkbox" name="realAppendSent" value="on" defaultChecked={rf.appendSent} className="mt-1" />
            <span>
              送信したメールの控えを送信済みフォルダに保存する
              <span className="block text-xs text-muted">Gmail はサーバが自動で保存するので、外さないと控えが二重になります。</span>
            </span>
          </label>
          <div className="flex flex-col gap-2">
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
            <p className="text-xs text-muted">
              入力中の内容で IMAP と SMTP にログインできるかだけを試します。メールは送らず、設定も保存しません。
            </p>
            {test ? (
              <p role="status" className={`whitespace-pre-line ${test.ok ? "text-muted" : "text-red-600"}`}>
                {test.message}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            パスワードはキーチェーンにだけ保存し、データベースや画面には残しません。多くのサービスでは、通常のパスワードではなく「アプリ用パスワード」の発行が必要です。実アカウントのメールは、仕分けも含めて外部の
            AI(Jev)へは送りません。
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        <legend className="px-1 font-semibold">ローカル AI</legend>
        <label className="flex flex-col gap-1">
          <span>ベース URL(OpenAI 互換 API)</span>
          <input name="aiBaseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultBaseUrl} className={inputClass} autoComplete="off" />
          <span className="text-xs text-muted">
            llama-server: http://localhost:8080/v1 ・ LM Studio: http://localhost:1234/v1 ・ Ollama: http://localhost:11434/v1
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span>埋め込み用のベース URL(空欄なら上と同じ)</span>
          <input name="aiEmbedBaseUrl" value={embedBaseUrl} onChange={(e) => setEmbedBaseUrl(e.target.value)} placeholder="例: http://localhost:8082/v1" className={inputClass} autoComplete="off" />
          <span className="text-xs text-muted">llama-server はモデルごとにサーバが分かれるので、埋め込みモデルのサーバを別に指定します。</span>
        </label>
        {external ? (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            このマシンの外の URL が含まれています。要約や検索のたびに、メールの本文がその宛先へ送信されます。
          </p>
        ) : null}
        {chatError || embedError ? (
          <p role="alert" className="text-red-600">{chatError ?? embedError}</p>
        ) : (
          <p className="text-xs text-muted">保存済みの接続先に接続できています。URL を変えたら、保存するとモデル一覧が更新されます。</p>
        )}
        <ModelField name="aiChatModel" label="会話用モデル(要約・下書き・仕分け・抽出)" value={ai.chatModel} options={chatModels} />
        <label className="flex items-start gap-2">
          <input type="checkbox" name="aiThinking" value="on" defaultChecked={ai.thinking} className="mt-1" />
          <span>
            回答の前にモデルに考えさせる(思考モード)
            <span className="block text-xs text-muted">
              対応モデルのみ。判断は丁寧になりますが、1 通あたりの待ち時間が数倍〜数十倍に延びます。速さと質の違いを比べる実験用です。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="aiClassifyKnn" value="on" defaultChecked={ai.classifyKnn} className="mt-1" />
          <span>
            仕分けは、まず似たメールの仕分けから推定する(近傍法)
            <span className="block text-xs text-muted">
              検索用の埋め込みを使い、1 通あたり数ミリ秒で仕分けます。似たメールの仕分けが割れているときや、見たことのない種類のメールだけ、会話用モデルに聞きます。手本になるのは会話用モデルの判定と、あなたが確定した仕分けです(仕分け済みが 20 通に満たないうちは、すべて会話用モデルに聞きます)。
            </span>
          </span>
        </label>
        <ModelField name="aiEmbedModel" label="埋め込み用モデル(意味検索)" value={ai.embedModel} options={embedModels} />
        <p className="text-xs text-muted">埋め込み用モデルを変えたら、検索画面で索引を作り直す必要があります(モデルが違うベクトル同士は比べられません)。</p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-accent px-4 py-2 font-medium text-panel hover:opacity-90 disabled:opacity-60">
          {pending ? "保存中…" : "保存"}
        </button>
        {state ? <p role="status" className={state.ok ? "text-muted" : "text-red-600"}>{state.message}</p> : null}
      </div>
    </form>
  );
}

function ModelField({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  // 一覧に無い設定済みの値(接続できないときなど)も選択肢に残す
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <select name={name} defaultValue={value} className={inputClass}>
        <option value="">自動(一覧の先頭を使う)</option>
        {all.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  ...input
}: { label: string; name: string; defaultValue: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      <input {...input} className={inputClass} autoComplete="off" />
    </label>
  );
}
