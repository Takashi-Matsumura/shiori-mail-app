"use client";

import { useSyncExternalStore } from "react";

const EVENT = "stored-flag-change";

function subscribe(onChange: () => void) {
  // storage は他のタブでの変更、EVENT はこのタブでの変更
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * ブラウザに保存するオン/オフの設定(パネルの開閉など)。
 * サーバ側では保存値が分からないので fallback で描く。保存値が違うと、再読み込みの直後に一瞬だけ fallback の見た目になる。
 */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : stored === "1";
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = (next: boolean) => {
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // 保存できない環境では切り替えられない
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, set];
}
