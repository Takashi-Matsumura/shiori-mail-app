"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { discardDraftAction, saveDraftAction } from "@/app/actions";
import type { ComposeDraft, ComposeDraftFields } from "@/lib/drafts";

/** 打つたびではなく、手が止まってから保存する */
const SAVE_DELAY_MS = 800;

const same = (a: ComposeDraftFields, b: ComposeDraftFields) =>
  a.to === b.to && a.cc === b.cc && a.bcc === b.bcc && a.subject === b.subject && a.body === b.body && a.includeQuote === b.includeQuote;

/**
 * 作成画面の書きかけを、サーバ(ログインの内側)に自動で保存する。画面を離れたり、ロックされたりしても戻せる。
 * ブラウザには残さない(ロック中に、ブラウザの保存領域から読まれないように)。
 * kind は「new」「reply-12」「forward-12」のように、どのメールへの返信・転送かで分ける。
 * 開いたときに保存済みの書きかけ(stored)があれば saved に入る。戻すかどうかは利用者が決める(勝手に入れ替えると、開き直したときに戸惑う)。
 */
export function useComposeDraft(kind: string, stored: ComposeDraft | null, current: ComposeDraftFields, initial: ComposeDraftFields) {
  // 書き始めたら、開いたときの書きかけは上書きされるので、戻す案内は消す
  const [settled, setSettled] = useState(false);
  // 送信を始めたら、もう保存しない(送ったあとに書きかけが残らないように)
  const stopped = useRef(false);

  const { to, cc, bcc, subject, body, includeQuote } = current;
  useEffect(() => {
    const fields = { to, cc, bcc, subject, body, includeQuote };
    // 開いたときの初期値のままなら保存しない(返信を開いただけで書きかけ扱いにしない)
    if (same(fields, initial) || (stored && same(fields, stored))) return;
    const timer = setTimeout(() => {
      if (stopped.current) return;
      setSettled(true);
      saveDraftAction(kind, fields).catch(() => {
        // 保存できなくても書くのには困らないので、知らせずに次の機会に任せる
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [kind, to, cc, bcc, subject, body, includeQuote, initial, stored]);

  const stop = useCallback(() => {
    stopped.current = true;
  }, []);
  const resume = useCallback(() => {
    stopped.current = false;
  }, []);
  const discard = useCallback(() => {
    setSettled(true);
    discardDraftAction(kind).catch(() => {});
  }, [kind]);
  const saved = stored && !settled && !same(stored, current) && !same(stored, initial) ? stored : null;
  return { saved, discard, stop, resume };
}
