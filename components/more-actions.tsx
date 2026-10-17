"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AquaButton } from "@/components/aqua-button";
import { ForwardIcon, MoreIcon } from "@/components/icons";

/**
 * 返信の横に置く「…」。転送のように、たまにしか使わない応答をメニューにしまっておく。
 * Esc・メニューの外を押す・項目を選ぶ、のどれかで閉じる。
 */
export function MoreActions({ messageId }: { messageId: number }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex shrink-0 flex-col items-center gap-1">
      {/* 返信(md)と縦の中心を揃えるため、小さいボタンを md と同じ高さの枠に入れる */}
      <div className="flex h-13 items-center">
        <AquaButton
          type="button"
          tone="glass"
          size="sm"
          label="その他の操作"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreIcon />
        </AquaButton>
      </div>
      <span aria-hidden="true" className="text-[11px] text-muted">
        その他
      </span>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="その他の操作"
          className="absolute top-full right-0 z-20 mt-1 flex min-w-36 flex-col rounded-lg border border-line bg-panel p-1 text-sm shadow-lg"
        >
          <Link
            role="menuitem"
            href={`/compose?forward=${messageId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 whitespace-nowrap hover:bg-background focus-visible:bg-background focus-visible:outline-none [&_svg]:size-4 [&_svg]:text-muted"
          >
            <ForwardIcon />
            転送
          </Link>
        </div>
      ) : null}
    </div>
  );
}
