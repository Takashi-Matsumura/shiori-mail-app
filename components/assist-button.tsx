"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AiPanel, type AiPanelProps } from "@/components/ai-panel";
import { AquaButton } from "@/components/aqua-button";
import { CloseIcon, SparkleIcon } from "@/components/icons";

/**
 * メールの上部に並ぶ「栞のアシスト」ボタン。押すと、画面の右端から要約・仕分け・予定の抜き出しのパネルを出す。
 * 本文の流れの中に置くとメールと紛れるので、使いたいときだけ開く。
 */
export function AssistButton(props: AiPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {/* 整理の操作は、応答(返信・その他)より一回り小さくする。枠は応答のボタンと同じ高さにして、上下の中心を揃える */}
      <div className="flex h-13 items-center">
        <AquaButton type="button" tone="jelly" size="sm" label="栞のアシスト" aria-expanded={open} onClick={() => setOpen(true)}>
          <SparkleIcon />
        </AquaButton>
      </div>
      <span className="text-[11px] text-muted">アシスト</span>
      {open ? createPortal(<AssistSheet {...props} onClose={() => setOpen(false)} />, document.body) : null}
    </div>
  );
}

/** 右端から出すパネル。Esc・×・パネルの外を押すと閉じる(閉じると、開く前に押したボタンへフォーカスが戻る) */
function AssistSheet({ onClose, ...props }: AiPanelProps & { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="栞のアシスト"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(36rem,100%)] max-w-none border-l border-line bg-panel p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/25"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-1.5 font-semibold text-accent [&_svg]:size-4">
            <SparkleIcon />
            栞のアシスト
          </h2>
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            aria-label="閉じる"
            title="閉じる"
            className="-m-1.5 shrink-0 rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <AiPanel {...props} />
        </div>
      </div>
    </dialog>
  );
}
