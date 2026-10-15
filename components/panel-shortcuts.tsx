"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { InfoDialog } from "@/components/info-button";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

const SHORTCUTS = [
  { keys: ["←"], description: "左のパネルを開く/畳む" },
  { keys: ["→"], description: "右のパネルを開く/畳む" },
  { keys: ["↑"], description: "左右のパネルを両方開く" },
  { keys: ["↓"], description: "左右のパネルを両方畳む" },
  { keys: ["?"], description: "この一覧を表示する" },
];

/**
 * 矢印キーで左右のパネル(SidePanel)を開閉する。
 * ← は左、→ は右のパネルを開閉し、↑ は両方を開き、↓ は両方を畳む。? でショートカットの一覧を出す。
 * 文字を打っている最中や、修飾キーと一緒に押したとき、ダイアログを開いているときは何もしない。
 */
export function PanelShortcuts() {
  // SidePanel と同じキーで開閉の状態を共有する
  const [leftCollapsed, setLeftCollapsed] = useStoredFlag("side-panel:left", false);
  const [rightCollapsed, setRightCollapsed] = useStoredFlag("side-panel:right", false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditable(e.target) || document.querySelector("dialog[open]")) return;
      // ? は配列によって Shift と一緒に押すので、Shift の有無は見ない
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.shiftKey) return;
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
  return helpOpen
    ? createPortal(
        <InfoDialog title="キーボードショートカット" onClose={() => setHelpOpen(false)}>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
            {SHORTCUTS.map(({ keys, description }) => (
              <div key={description} className="contents">
                <dt className="flex gap-1">
                  {keys.map((key) => (
                    <kbd key={key} className="min-w-7 rounded border border-line bg-background px-1.5 py-0.5 text-center font-sans text-xs">
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">文字を入力しているときは使えません。</p>
        </InfoDialog>,
        document.body,
      )
    : null;
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  // チェックボックスやボタン以外の input は、矢印キーでカーソルや値を動かす
  if (target instanceof HTMLInputElement) return !["checkbox", "button", "submit", "reset"].includes(target.type);
  return false;
}
