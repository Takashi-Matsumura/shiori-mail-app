import { Suspense } from "react";
import { SettingsForm } from "@/components/settings-form";
import { getActiveAccount, getLocalAccount, getRealAccount } from "@/lib/accounts";
import { AiError, listModels } from "@/lib/ai/client";
import { DEFAULT_AI_BASE_URL, getAiConfig } from "@/lib/ai/config";
import { io } from "next/cache";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">設定</h1>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Settings />
        </Suspense>
      </div>
    </div>
  );
}

async function Settings() {
  await io();
  const active = getActiveAccount();
  const local = getLocalAccount();
  const real = getRealAccount();
  const cfg = getAiConfig();
  const separateEmbed = cfg.embedBaseUrl !== cfg.baseUrl;
  const load = (url: string) =>
    listModels(url).then(
      (models) => ({ models, error: null as string | null }),
      (e) => ({ models: [] as string[], error: e instanceof AiError ? e.message : "モデル一覧を取得できませんでした。" }),
    );
  const chat = await load(cfg.baseUrl);
  const embed = separateEmbed ? await load(cfg.embedBaseUrl) : chat;
  const describe = (a: typeof local) =>
    `IMAP ${a.imap.host}:${a.imap.port}${a.imap.secure ? " (TLS)" : ""} / SMTP ${a.smtp.host}:${a.smtp.port}${a.smtp.secure ? " (TLS)" : ""}`;
  return (
    <SettingsForm
      activeAccount={active.id}
      local={{ email: local.email, servers: describe(local) }}
      real={real ? { email: real.email, servers: describe(real) } : null}
      ai={{
        baseUrl: cfg.baseUrl,
        embedBaseUrl: separateEmbed ? cfg.embedBaseUrl : "",
        chatModel: cfg.chatModel,
        embedModel: cfg.embedModel,
        thinking: cfg.thinking,
      }}
      defaultBaseUrl={DEFAULT_AI_BASE_URL}
      chatModels={chat.models.filter((m) => !/embed/i.test(m))}
      // 埋め込み専用サーバなら、そこにあるモデルはすべて埋め込み用とみなす
      embedModels={separateEmbed ? embed.models : embed.models.filter((m) => /embed/i.test(m))}
      chatError={chat.error}
      embedError={separateEmbed ? embed.error : null}
    />
  );
}
