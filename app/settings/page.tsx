import { Suspense } from "react";
import { SettingsForm } from "@/components/settings-form";
import { getActiveAccount, getLocalAccount, getRealAccount } from "@/lib/accounts";
import { AiError, listModels } from "@/lib/ai/client";
import { DEFAULT_AI_BASE_URL, getAiConfig, isLoopbackUrl } from "@/lib/ai/config";
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
  let models: string[] = [];
  let modelError: string | null = null;
  try {
    models = await listModels(cfg);
  } catch (e) {
    modelError = e instanceof AiError ? e.message : "モデル一覧を取得できませんでした。";
  }
  const describe = (a: typeof local) =>
    `IMAP ${a.imap.host}:${a.imap.port}${a.imap.secure ? " (TLS)" : ""} / SMTP ${a.smtp.host}:${a.smtp.port}${a.smtp.secure ? " (TLS)" : ""}`;
  return (
    <SettingsForm
      activeAccount={active.id}
      local={{ email: local.email, servers: describe(local) }}
      real={real ? { email: real.email, servers: describe(real) } : null}
      ai={{ baseUrl: cfg.baseUrl, chatModel: cfg.chatModel, embedModel: cfg.embedModel, isLocal: isLoopbackUrl(cfg.baseUrl) }}
      defaultBaseUrl={DEFAULT_AI_BASE_URL}
      models={models}
      modelError={modelError}
    />
  );
}
