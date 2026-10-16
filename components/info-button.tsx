"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";
import { Markdown } from "@/components/markdown";

/**
 * 設定項目の説明を、ⓘ を押したときだけダイアログで見せる。慣れた人には説明文が多すぎるので、ふだんは畳んでおく。
 * 説明文はマークダウンで書く(文面は lib/help-texts.ts にまとめてある)。
 * ダイアログは body 直下に出す(<label> の中に置くと、ダイアログを押したときにチェックボックスが切り替わってしまう)。
 */
export function InfoButton({ title, markdown }: { title: string; markdown: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`「${title}」の説明`}
        title="説明を見る"
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 align-middle text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6" />
          <path d="M12 7.5h.01" />
        </svg>
      </button>
      {open ? createPortal(<InfoDialog title={title} markdown={markdown} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

/**
 * 説明用のダイアログ。開いた状態で描かれ、閉じると onClose が呼ばれる。
 * 本文は markdown で渡す。children には、本文の下に置くボタンなど(説明ではないもの)だけを渡す。
 */
export function InfoDialog({
  title,
  markdown,
  onClose,
  children,
}: {
  title: string;
  markdown: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Esc でも閉じられる。閉じたら、開く前に押した ⓘ へフォーカスが戻る
      onClose={onClose}
      // 枠の外(背景)を押しても閉じる
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-lg rounded-lg border border-line bg-panel p-0 text-sm text-foreground shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
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
        <Markdown>{markdown}</Markdown>
        {children}
      </div>
    </dialog>
  );
}
