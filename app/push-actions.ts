"use server";

import { requireSession } from "@/lib/auth/session";
import { deleteSubscription, isAllowedEndpoint, isSubscribed, saveSubscription, sendTestNotification, type PushSubscriptionJSON } from "@/lib/push";

/** 設定画面の「通知を受け取る」。端末(ブラウザ)が作った送り先を保存する */
export async function savePushSubscriptionAction(sub: unknown): Promise<{ ok: boolean; message: string }> {
  await requireSession();
  const s = sub as Partial<PushSubscriptionJSON> | null;
  const endpoint = s?.endpoint;
  const p256dh = s?.keys?.p256dh;
  const auth = s?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return { ok: false, message: "通知の登録に必要な情報が足りません。" };
  }
  if (!isAllowedEndpoint(endpoint)) return { ok: false, message: "このブラウザの通知の送り先には対応していません。" };
  if (p256dh.length > 200 || auth.length > 100) return { ok: false, message: "通知の登録に必要な情報が正しくありません。" };
  saveSubscription({ endpoint, keys: { p256dh, auth } });
  return { ok: true, message: "この端末で通知を受け取ります。" };
}

/** 設定画面の「通知を止める」 */
export async function deletePushSubscriptionAction(endpoint: unknown): Promise<void> {
  await requireSession();
  if (typeof endpoint === "string") deleteSubscription(endpoint);
}

/** 設定画面の「テスト通知を送る」。登録してあるすべての端末へ送る */
export async function sendTestPushAction(): Promise<void> {
  await requireSession();
  await sendTestNotification();
}

/** この端末の送り先が、サーバに登録されているか(画面の「受け取っています」の判定) */
export async function isPushSubscribedAction(endpoint: unknown): Promise<boolean> {
  await requireSession();
  return typeof endpoint === "string" && isSubscribed(endpoint);
}
