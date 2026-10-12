"use client";

import { useActionState, useState } from "react";
import { saveSettingsAction, type ActionState } from "@/app/actions";

type AccountInfo = { email: string; servers: string };

type Props = {
  activeAccount: "local" | "real";
  local: AccountInfo;
  real: AccountInfo | null;
  ai: { baseUrl: string; embedBaseUrl: string; chatModel: string; embedModel: string; thinking: boolean };
  defaultBaseUrl: string;
  chatModels: string[];
  embedModels: string[];
  chatError: string | null;
  embedError: string | null;
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

export function SettingsForm({ activeAccount, local, real, ai, defaultBaseUrl, chatModels, embedModels, chatError, embedError }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettingsAction, null);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [embedBaseUrl, setEmbedBaseUrl] = useState(ai.embedBaseUrl);
  const external = [baseUrl, embedBaseUrl].some((u) => u.trim() !== "" && !isLoopback(u));

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
