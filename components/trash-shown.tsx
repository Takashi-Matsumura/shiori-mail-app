"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { trashMessagesAction } from "@/app/actions";

/**
 * 一覧に表示しているメールを、まとめてサーバのゴミ箱へ移す。
 * 押すとまず内訳を見せ、もう一度押して初めて移す(ブラウザの確認ダイアログは使わない)。
 * 確認中に表示が変わったら(フィルタの切り替えや新着)、確認を取り消して最初からにする。
 */
export function TrashShown({ items }: { items: { uid: number; category: string | null }[] }) {
  const router = useRouter();
  const params = useParams<{ uid?: string }>();
  // 確認を出したときの表示(UID の並び)。今の表示と違えば確認は取り消し扱い
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const signature = items.map((i) => i.uid).join(",");
  const confirming = confirmedFor === signature;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 内訳。仕分け前のメールが混ざっていたら気づけるよう、それも数えて見せる
  const breakdown = new Map<string, number>();
  for (const i of items) breakdown.set(i.category ?? "仕分け前", (breakdown.get(i.category ?? "仕分け前") ?? 0) + 1);

  const run = () =>
    startTransition(async () => {
      const uids = items.map((i) => i.uid);
      const result = await trashMessagesAction(uids);
      setConfirmedFor(null);
      setMessage(result ? { ok: result.ok, text: result.message } : null);
      // 開いていたメールも消えたなら、一覧だけの画面へ戻る
      if (result?.ok && params.uid && uids.includes(Number(params.uid))) router.push("/mail/inbox");
    });

  if (items.length === 0) return message ? <Status {...message} /> : null;

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {confirming ? (
        <div role="alertdialog" aria-label="ゴミ箱へ移す確認" className="flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/40">
          <p>
            表示中の <strong className="tabular-nums">{items.length} 通</strong>をサーバのゴミ箱へ移します。
            <span className="text-muted">
              (
              {[...breakdown].map(([c, n]) => `${c} ${n}`).join("・")}
              )
            </span>
          </p>
          <p className="text-muted">ゴミ箱からは戻せます(Gmail では 30 日後に完全に消えます)。</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="rounded-full bg-red-700 px-3 py-1 font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600"
            >
              {pending ? "移しています…" : `${items.length} 通をゴミ箱へ移す`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmedFor(null)}
              disabled={pending}
              className="rounded-full border border-line bg-panel px-3 py-1 hover:border-accent"
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setConfirmedFor(signature);
          }}
          className="self-start rounded-full border border-line bg-panel px-2.5 py-1 text-muted hover:border-red-400 hover:text-red-700 dark:hover:text-red-300"
        >
          表示中の {items.length} 通をゴミ箱へ…
        </button>
      )}
      {message ? <Status {...message} /> : null}
    </div>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p role={ok ? "status" : "alert"} className={ok ? "text-muted" : "text-red-700 dark:text-red-300"}>
      {text}
    </p>
  );
}
