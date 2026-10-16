"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "hidden-categories";
const EVENT = "hidden-categories-change";

function subscribe(onChange: () => void) {
  // storage は他のタブでの変更、EVENT はこのタブでの変更
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/**
 * 一覧で隠す仕分け(宣伝など)。このブラウザの localStorage に保存する。
 * サーバ側では保存値が分からないので、何も隠さない状態で描く。
 */
export function useHiddenCategories(): [Set<string>, (category: string) => void] {
  // スナップショットは文字列のまま比べる(毎回 Set を作ると、変わっていなくても描き直しになる)
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  const hidden = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);

  const toggle = (category: string) => {
    const next = new Set(hidden);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // 保存できない環境では切り替えられない
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [hidden, toggle];
}
