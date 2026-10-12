"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction, type ActionState } from "@/app/actions";

type AccountInfo = { email: string; servers: string };

type Props = {
  activeAccount: "local" | "real";
  local: AccountInfo;
  real: AccountInfo | null;
  ai: { baseUrl: string; chatModel: string; embedModel: string; isLocal: boolean };
  defaultBaseUrl: string;
  models: string[];
  modelError: string | null;
};

const inputClass = "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 focus:border-accent focus:outline-none";

const ENV_EXAMPLE = `REAL_MAIL_ADDRESS=you@example.com
REAL_MAIL_NAME=表示名
REAL_MAIL_PASSWORD=アプリ用パスワード
REAL_IMAP_HOST=imap.example.com
REAL_IMAP_PORT=993
REAL_SMTP_HOST=smtp.example.com
REAL_SMTP_PORT=465
# 任意: REAL_MAIL_USER(ログイン名がアドレスと違う場合) / REAL_SENT_MAILBOX / REAL_APPEND_SENT=false(Gmail)`;

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return true;
  }
}

export function SettingsForm({ activeAccount, local, real, ai, defaultBaseUrl, models, modelError }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettingsAction, null);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const external = baseUrl.trim() !== "" && !isLoopback(baseUrl);
  const chatModels = models.filter((m) => !/embed/i.test(m));
  const embedModels = models.filter((m) => /embed/i.test(m));

  return (
    <form action={action} className="flex flex-col gap-5">
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
          <input type="radio" name="account" value="real" defaultChecked={activeAccount === "real"} disabled={!real} className="mt-1" />
          <span>
            実アカウント{real ? `(${real.email})` : "(未設定)"}
            <span className="block text-xs text-muted">
              {real ? `${real.servers} ・ 送信すると実際に相手へ届きます` : "下の内容を .env.local に書いて、開発サーバを再起動すると選べます"}
            </span>
          </span>
        </label>
        {!real ? <pre className="overflow-x-auto rounded bg-background p-3 font-mono text-xs">{ENV_EXAMPLE}</pre> : null}
        <p className="text-xs text-muted">
          パスワードは .env.local にだけ置き、この画面やデータベースには保存しません。多くのサービスでは、通常のパスワードではなく「アプリ用パスワード」の発行が必要です。
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        <legend className="px-1 font-semibold">ローカル AI</legend>
        <label className="flex flex-col gap-1">
          <span>ベース URL(OpenAI 互換 API)</span>
          <input name="aiBaseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultBaseUrl} className={inputClass} autoComplete="off" />
          <span className="text-xs text-muted">
            LM Studio: http://localhost:1234/v1 ・ Ollama: http://localhost:11434/v1 ・ llama-server: http://localhost:8080/v1
          </span>
        </label>
        {external ? (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            この URL はこのマシンの外です。要約や検索のたびに、メールの本文がその宛先へ送信されます。
          </p>
        ) : null}
        {modelError ? (
          <p role="alert" className="text-red-600">{modelError}</p>
        ) : (
          <p className="text-xs text-muted">接続できています。利用できるモデル: {models.length} 個</p>
        )}
        <ModelField name="aiChatModel" label="会話用モデル(要約・下書き・仕分け・抽出)" value={ai.chatModel} options={chatModels} />
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
