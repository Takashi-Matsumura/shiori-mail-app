"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type ComposeDraft = { to: string; cc: string; subject: string; body: string; includeQuote: boolean; savedAt: number };
type Fields = Omit<ComposeDraft, "savedAt">;

const PREFIX = "compose-draft:";
const EVENT = "compose-draft-change";
/** 書いてから長く放っておいた書きかけは、もう要らないものとして出さない */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** 打つたびではなく、手が止まってから保存する */
const SAVE_DELAY_MS = 800;

function subscribe(onChange: () => void) {
  // storage は他のタブでの変更、EVENT はこのタブでの変更
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 保存できない環境(プライベートウィンドウなど)では、書きかけは残らない
  }
  window.dispatchEvent(new Event(EVENT));
}

const same = (a: Fields, b: Fields) =>
  a.to === b.to && a.cc === b.cc && a.subject === b.subject && a.body === b.body && a.includeQuote === b.includeQuote;

/**
 * 作成画面の書きかけを、このブラウザ(localStorage)に自動で保存する。画面を離れたり再読み込みしたりしても戻せる。
 * kind は「new」「reply-12」「forward-12」のように、どのメールへの返信・転送かで分ける。
 * 開いたときに保存済みの書きかけがあれば saved に入る。戻すかどうかは利用者が決める(勝手に入れ替えると、開き直したときに戸惑う)。
 */
export function useComposeDraft(kind: string, current: Fields, initial: Fields) {
  const key = PREFIX + kind;
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      // 古すぎる書きかけは、読むときに無かったことにする(スナップショットは同じ文字列を返すので、描き直しは増えない)
      try {
        const value = localStorage.getItem(key);
        const savedAt = value ? (JSON.parse(value) as { savedAt?: unknown }).savedAt : null;
        return typeof savedAt === "number" && Date.now() - savedAt < MAX_AGE_MS ? value : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  const stored = useMemo<ComposeDraft | null>(() => {
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as ComposeDraft;
      return typeof d.body === "string" ? d : null;
    } catch {
      return null;
    }
  }, [raw]);

  // 開いたときの初期値のままなら保存しない(返信を開いただけで書きかけ扱いにしない)
  const { to, cc, subject, body, includeQuote } = current;
  useEffect(() => {
    const fields = { to, cc, subject, body, includeQuote };
    if (same(fields, initial)) return;
    const timer = setTimeout(() => write(key, JSON.stringify({ ...fields, savedAt: Date.now() })), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, to, cc, subject, body, includeQuote, initial]);

  const discard = useCallback(() => write(key, null), [key]);
  // いま画面にあるものと同じなら、戻す意味がない
  const saved = stored && !same(stored, current) && !same(stored, initial) ? stored : null;
  return { saved, discard };
}
