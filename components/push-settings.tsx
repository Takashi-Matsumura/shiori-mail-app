"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePushSubscriptionAction, isPushSubscribedAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/push-actions";
import { InfoButton } from "@/components/info-button";
import { HELP } from "@/lib/help-texts";

type State = "checking" | "needs-home-screen" | "unsupported" | "denied" | "off" | "on";

/** VAPID の公開鍵(base64url)を、pushManager.subscribe が受け取る形にする */
function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** 設定画面の「新着の通知」。この端末(ブラウザ)で通知を受け取るかを切り替える */
export function PushSettings({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone の Safari では、ホーム画面に追加したアプリの中でだけ使える
        setState(isIos() && !isStandalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      // 同じオリジンの別のアプリ(localhost の別プロジェクトなど)が残した送り先もあるので、サーバに登録があるかで決める
      setState(sub && (await isPushSubscribedAction(sub.endpoint)) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const subscribe = () =>
    start(async () => {
      setMessage(null);
      try {
        // iPhone では、ボタンを押した流れの中で許可を求めないと断られるので、最初に聞く
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        const key = decodeKey(publicKey);
        let sub = await reg.pushManager.getSubscription();
        // 別の鍵で作られた送り先(以前の登録や、同じオリジンの別のアプリのもの)には、こちらからは送れないので作り直す
        if (sub && !sameKey(sub.options.applicationServerKey, key)) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const r = await savePushSubscriptionAction(sub.toJSON());
        setMessage({ ok: r.ok, text: r.message });
        if (r.ok) setState("on");
        else await sub.unsubscribe();
      } catch {
        setMessage({ ok: false, text: "通知を登録できませんでした。もう一度お試しください。" });
      }
    });

  const unsubscribe = () =>
    start(async () => {
      setMessage(null);
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMessage({ ok: true, text: "この端末の通知を止めました。" });
    });

  const test = () =>
    start(async () => {
      await sendTestPushAction();
      setMessage({ ok: true, text: "テスト通知を送りました。届かないときは、端末の通知の設定を確かめてください。" });
    });

  const button = "rounded-md border border-accent px-3 py-1.5 text-accent hover:bg-accent-soft disabled:opacity-60";
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-5">
      <legend className="flex items-center gap-1 px-1 font-semibold">
        新着の通知
        <InfoButton title="新着の通知" markdown={HELP.notifications} />
      </legend>
      {state === "checking" ? <p className="text-xs text-muted">確認中…</p> : null}
      {state === "needs-home-screen" ? (
        <p className="text-xs text-muted">
          iPhone では、Safari の「共有」→「ホーム画面に追加」で追加した Shiori を開いてから設定してください。
        </p>
      ) : null}
      {state === "unsupported" ? <p className="text-xs text-muted">このブラウザは通知に対応していません。</p> : null}
      {state === "denied" ? (
        <p className="text-xs text-muted">
          通知が許可されていません。iPhone なら「設定」→「通知」→「Shiori」で許可してから、この画面を開き直してください。
        </p>
      ) : null}
      {state === "off" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">栞が「要返信」と仕分けた新着メールを、この端末に差出人と件名で通知します。</p>
          <button type="button" onClick={subscribe} disabled={pending} className={button}>
            {pending ? "登録中…" : "通知を受け取る"}
          </button>
        </div>
      ) : null}
      {state === "on" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">この端末で、「要返信」の新着メールの通知を受け取っています。</p>
          <div className="flex gap-2">
            <button type="button" onClick={test} disabled={pending} className={button}>
              テスト通知
            </button>
            <button type="button" onClick={unsubscribe} disabled={pending} className={button}>
              通知を止める
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className={`text-xs ${message.ok ? "text-muted" : "text-red-700 dark:text-red-300"}`}>
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
