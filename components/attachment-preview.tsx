"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

/** 中身を見せる添付。url は blob:(自分で付けたファイル)か /api/attachments/…(転送元の添付) */
export type PreviewTarget = { name: string; size: string; contentType: string; url: string };

/** テキストは長すぎると重くなるので、頭のこの文字数だけ見せる */
const TEXT_LIMIT = 200_000;

/** 添付の中身を見るダイアログ。開いた状態で描かれ、閉じると onClose が呼ばれる。画像・PDF・テキストだけを渡す */
export function AttachmentPreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const type = target.contentType.toLowerCase().split(";")[0].trim();
  return createPortal(
    <dialog
      ref={ref}
      aria-label={`${target.name} の中身`}
      // Esc でも閉じられる。閉じたら、押したサムネイルへフォーカスが戻る
      onClose={onClose}
      // 枠の外(背景)を押しても閉じる
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl rounded-lg border border-line bg-panel p-0 text-sm text-foreground shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold" title={target.name}>{target.name}</h2>
            <p className="text-xs text-muted tabular-nums">{target.size}</p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            aria-label="閉じる"
            title="閉じる"
            className="-m-1 shrink-0 rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            <CloseIcon />
          </button>
        </div>
        {type.startsWith("image/") ? (
          // blob: の URL も表示するので next/image は使わない
          // eslint-disable-next-line @next/next/no-img-element
          <img src={target.url} alt={target.name} className="mx-auto max-h-[calc(100dvh-10rem)] max-w-full rounded-md object-contain" />
        ) : type === "application/pdf" ? (
          <iframe src={target.url} title={target.name} className="h-[calc(100dvh-10rem)] w-full rounded-md border border-line bg-white" />
        ) : (
          <TextPreview url={target.url} />
        )}
      </div>
    </dialog>,
    document.body,
  );
}

/** テキストは取ってきて、文字列のまま見せる(HTML としては解釈しない) */
function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(url, { signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((t) => setText(t.length > TEXT_LIMIT ? `${t.slice(0, TEXT_LIMIT)}\n\n…(長いので、ここまでを表示しています)` : t))
      .catch((e) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [url]);
  if (error) return <p role="alert" className="text-red-600">読み込めませんでした ({error})</p>;
  return (
    <pre className="max-h-[calc(100dvh-10rem)] overflow-auto rounded-md border border-line bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      {text ?? "読み込み中…"}
    </pre>
  );
}
