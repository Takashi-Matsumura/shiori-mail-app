"use client";

import { useEffect } from "react";
import { currentPath, lockAndGoToLogin } from "@/lib/client/lock";

// サーバ側のセッション(lib/auth/session.ts の IDLE_MS)と同じ長さにそろえる
const IDLE_MS = 30 * 60_000;
// 操作の知らせをサーバへ送る間隔の下限。サーバも最終アクセスの書き込みを 1 分に 1 回に間引いている
const ACTIVITY_PING_MS = 60_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * 操作が途切れたら、ロックしてログイン画面へ戻す。
 * サーバのセッションは自動同期などのリクエストでは延びないので、操作があったことを 1 分に 1 回まで知らせて延ばす。
 * 知らせが 401 で返ったら(サーバ側でセッションが切れていたら)、その場でロックする。
 */
export function IdleLock() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastPing = Date.now();
    const lock = () => lockAndGoToLogin(currentPath());
    const ping = () => {
      lastPing = Date.now();
      fetch("/api/auth/activity", { method: "POST" })
        .then((res) => {
          if (res.status === 401) lock();
        })
        .catch(() => {});
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_MS);
      if (Date.now() - lastPing >= ACTIVITY_PING_MS) ping();
    };
    // ロック後に「戻る」で bfcache から画面がそのまま戻ってきたら、読み込み直してセッションを確かめさせる
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    reset();
    for (const e of EVENTS) window.addEventListener(e, reset, { passive: true });
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearTimeout(timer);
      for (const e of EVENTS) window.removeEventListener(e, reset);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return null;
}
