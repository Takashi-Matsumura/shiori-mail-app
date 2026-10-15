"use client";

import { useEffect } from "react";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

/**
 * 矢印キーで左右のパネル(SidePanel)を開閉する。
 * ← は左、→ は右のパネルを開閉し、↑ は両方を開き、↓ は両方を畳む。
 * 文字を打っている最中や、修飾キーと一緒に押したとき、ダイアログを開いているときは何もしない。
 */
export function PanelShortcuts() {
  // SidePanel と同じキーで開閉の状態を共有する
  const [leftCollapsed, setLeftCollapsed] = useStoredFlag("side-panel:left", false);
  const [rightCollapsed, setRightCollapsed] = useStoredFlag("side-panel:right", false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isEditable(e.target) || document.querySelector("dialog[open]")) return;
      switch (e.key) {
        case "ArrowLeft":
          setLeftCollapsed(!leftCollapsed);
          break;
        case "ArrowRight":
          setRightCollapsed(!rightCollapsed);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          const collapse = e.key === "ArrowDown";
          setLeftCollapsed(collapse);
          setRightCollapsed(collapse);
          break;
        }
        default:
          return;
      }
      // 矢印キーの既定の動作(ページのスクロール)は止める
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leftCollapsed, rightCollapsed, setLeftCollapsed, setRightCollapsed]);
  return null;
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  // チェックボックスやボタン以外の input は、矢印キーでカーソルや値を動かす
  if (target instanceof HTMLInputElement) return !["checkbox", "button", "submit", "reset"].includes(target.type);
  return false;
}
