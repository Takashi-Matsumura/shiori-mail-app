"use client";

import { useEffect } from "react";
import { checkSession, currentPath, lockAndGoToLogin } from "@/lib/client/lock";

// サーバ側のセッション(lib/auth/session.ts の IDLE_MS)と同じ長さにそろえる
const IDLE_MS = 30 * 60_000;
// 操作の知らせをサーバへ送る間隔の下限。サーバも最終アクセスの書き込みを 1 分に 1 回に間引いている
const ACTIVITY_PING_MS = 60_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * 操作が途切れたら、ロックしてログイン画面へ戻す。
 * - サーバのセッションは自動同期などでは延びないので、操作があったことを 1 分に 1 回まで知らせて延ばす。
 *   知らせが 401 で返ったら(サーバ側で切れていたら)、その場でロックする
 * - iOS Safari などは、裏に回った画面のタイマーを止める。そのため「最後の操作からの経過時間」も持ち、
 *   画面が戻ってきたときに 30 分を超えていればロック、超えていなくてもサーバにセッションを確かめる
 *   (切れたあとも、メールの内容が画面に残り続けないように)
 */
export function IdleLock() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();
    let lastPing = lastActivity;
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
      lastActivity = Date.now();
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_MS);
      if (lastActivity - lastPing >= ACTIVITY_PING_MS) ping();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity >= IDLE_MS) void lock();
      else void checkSession();
    };
    // ロック後に「戻る」で bfcache から画面がそのまま戻ってきたら、読み込み直してセッションを確かめさせる
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    reset();
    for (const e of EVENTS) window.addEventListener(e, reset, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearTimeout(timer);
      for (const e of EVENTS) window.removeEventListener(e, reset);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return null;
}
