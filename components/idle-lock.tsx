"use client";

import { useEffect } from "react";

// サーバ側のセッション(lib/auth/session.ts の IDLE_MS)と同じ長さにそろえる。
// 画面を開いたままだと自動同期のリクエストでセッションが延び続けるので、操作の有無は画面側で見る
const IDLE_MS = 30 * 60_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** 操作が途切れたら、ロックしてログイン画面へ戻す。 */
export function IdleLock() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const lock = async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      // メールの内容を抱えたクライアント側のキャッシュを捨てたいので、ルーターの遷移ではなく読み込み直す
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_MS);
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
