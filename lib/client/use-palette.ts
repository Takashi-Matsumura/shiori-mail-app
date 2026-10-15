"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, isPaletteId, type PaletteId } from "@/lib/palette";

const EVENT = "palette-change";

function subscribe(onChange: () => void) {
  // storage は他のタブでの変更、EVENT はこのタブでの変更
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(): PaletteId {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPaletteId(stored) ? stored : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** このブラウザで選んでいる配色。サーバ側では保存値が分からないので既定の配色を返す。 */
export function usePalette(): [PaletteId, (next: PaletteId) => void] {
  const palette = useSyncExternalStore(subscribe, read, () => DEFAULT_PALETTE);
  const set = (next: PaletteId) => {
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      // 保存できない環境でも、開いている間だけは切り替える
    }
    document.documentElement.setAttribute("data-palette", next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [palette, set];
}

/**
 * <html data-palette> を保存値に合わせ続ける。
 * 開発時は React が <html> の属性を JSX の値へ戻すことがあり、<head> のスクリプトが付けた値が消えるため、描画の前に付け直す。
 * 他のタブで配色を変えたときも、ここで追従する。
 * usePalette の値は使わない(ハイドレーション中は既定の配色を返すので、一瞬だけ既定の配色に戻ってしまう)。
 */
export function PaletteSync() {
  useLayoutEffect(() => {
    const apply = () => document.documentElement.setAttribute("data-palette", read());
    apply();
    return subscribe(apply);
  }, []);
  return null;
}
