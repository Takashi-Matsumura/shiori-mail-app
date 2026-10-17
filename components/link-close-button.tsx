"use client";

import { useState } from "react";

/** 確認ページのタブを閉じる。スクリプトで閉じられないタブなら、閉じ方を案内する */
export function LinkCloseButton() {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          window.close();
          // 閉じられたらここには戻らない。少し待っても開いたままなら、閉じられなかったとみなす
          setTimeout(() => setFailed(true), 300);
        }}
        className="rounded-md border border-line px-4 py-2 hover:bg-background"
      >
        開かずに閉じる
      </button>
      {failed ? <p className="w-full text-xs text-muted">このタブは自動で閉じられませんでした。タブの × で閉じてください。</p> : null}
    </>
  );
}
