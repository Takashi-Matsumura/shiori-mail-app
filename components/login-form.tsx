"use client";

import { startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { useState } from "react";

type Mode = "login" | "register";

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** Touch ID(パスキー)で開く。パスキーがまだ無ければ、この Mac のパスキーを登録する。 */
export function LoginForm({ mode, next }: { mode: Mode; next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const opt = await post(path, { step: "options" });
      if (!opt.ok) throw new Error("サーバが応答しませんでした。");
      const optionsJSON = await opt.json();
      const response =
        mode === "login" ? await startAuthentication({ optionsJSON }) : await startRegistration({ optionsJSON });
      const res = await post(path, { step: "verify", response });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message ?? "うまくいきませんでした。");
      // 画面の枠ごと読み直したいので、クライアント側の遷移ではなく再読み込みで移る
      window.location.assign(next);
    } catch (e) {
      // 本人確認のダイアログを閉じたときは、何も言わずに戻す
      if (e instanceof WebAuthnError && e.name === "NotAllowedError") setError(null);
      else setError(e instanceof Error ? e.message : "うまくいきませんでした。");
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {mode === "register" ? (
        <p className="text-center text-muted">
          最初に、この Mac のパスキーを登録します。次からは Touch ID でアプリを開けます。
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2 font-medium text-panel hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "確認中…" : mode === "login" ? "Touch ID で開く" : "パスキーを登録する"}
      </button>
      {error ? (
        <p role="alert" className="text-center text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
