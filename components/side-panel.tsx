"use client";

import { useId } from "react";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

/**
 * 畳める左右のパネル。畳むと細い帯になり、開くボタンと rail(要点だけの表示)が残る。
 * 開閉の状態はブラウザに保存する(畳んだまま再読み込みすると、一瞬だけ開いて見える)。
 * 狭い画面では隠す(左は md 未満、右は lg 未満)。スマホ幅では、代わりに画面下のタブ(MobileNav)を出す。
 * 隠しても中身は外さないので、左パネルの自動処理(AutoRunner)は動き続ける。
 */
export function SidePanel({ side, label, rail, children }: {
  side: "left" | "right";
  label: string;
  rail: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useStoredFlag(`side-panel:${side}`, false);
  const toggle = () => setCollapsed(!collapsed);
  // 矢印は、押したときにパネルの端が動く向き
  const arrow = (side === "left") === collapsed ? "»" : "«";
  const open = side === "left" ? "w-52" : "w-72";
  return (
    <aside
      aria-label={label}
      className={`shrink-0 flex-col bg-panel ${collapsed ? "w-12" : open} ${
        side === "left" ? "hidden border-r border-line md:flex" : "hidden border-l border-line lg:flex"
      }`}
    >
      <div className={`flex p-1.5 ${collapsed ? "justify-center" : side === "left" ? "justify-end" : "justify-start"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={id}
          aria-label={collapsed ? `${label}を開く` : `${label}を畳む`}
          title={collapsed ? `${label}を開く` : `${label}を畳む`}
          className="h-6 w-6 rounded-md leading-none text-muted hover:bg-background hover:text-foreground"
        >
          <span aria-hidden="true">{arrow}</span>
        </button>
      </div>
      <div id={id} hidden={collapsed} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      <div hidden={!collapsed} className="min-h-0 flex-1 overflow-y-auto">
        {rail}
      </div>
    </aside>
  );
}
