"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { trashMessagesAction } from "@/app/actions";
import { TrashIcon } from "@/components/icons";
import { InfoDialog } from "@/components/info-button";
import { escapeMarkdown } from "@/components/markdown";
import { trashHelp } from "@/lib/help-texts";

/**
 * 一覧に表示しているメールを、まとめてサーバのゴミ箱へ移す。
 * 押すと、ゴミ箱の仕組み(どこへ移り、どう戻せるか)を説明するダイアログを出し、そこで押して初めて移す。
 * 確認中に表示が変わったら(フィルタの切り替えや新着)、ダイアログを閉じて最初からにする。
 * 一覧の下のフッターに、アイコンのボタンと結果の一文を並べて出す。
 * 何も隠していないとき(filtered が false)は押せない(絞り込まずに受信トレイを丸ごと移せないように)。
 */
export function TrashShown({ items, filtered }: { items: { uid: number; category: string | null }[]; filtered: boolean }) {
  const router = useRouter();
  const params = useParams<{ uid?: string }>();
  // ダイアログを開いたときの表示(UID の並び)。今の表示と違えば確認は取り消し扱い
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

  const disabled = !filtered || items.length === 0 || pending;
  const label = !filtered
    ? "ゴミ箱へ移す(仕分けを隠して絞り込むと使えます)"
    : items.length === 0
      ? "ゴミ箱へ移す(表示中のメールがありません)"
      : `表示中の ${items.length} 通をゴミ箱へ移す…`;

  return (
    <>
      <p role={message?.ok === false ? "alert" : "status"} className={`min-w-0 flex-1 truncate text-xs ${message?.ok === false ? "text-red-700 dark:text-red-300" : "text-muted"}`} title={message?.text}>
        {message?.text}
      </p>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => {
          setMessage(null);
          setConfirmedFor(signature);
        }}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-35 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300"
      >
        <TrashIcon />
      </button>
      {confirming
        ? createPortal(
            <InfoDialog
              title={`${items.length} 通をゴミ箱へ移しますか？`}
              // 仕分けの名前は AI の出力なので、マークダウンの記号として解釈されないようにして埋め込む
              markdown={trashHelp(items.length, [...breakdown].map(([c, n]) => `${escapeMarkdown(c)} ${n}`).join("・"))}
              // 移している最中に閉じても、移す処理は止まらない(結果は一覧の上に出る)
              onClose={() => setConfirmedFor(null)}
            >
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmedFor(null)}
                  disabled={pending}
                  className="rounded-full border border-line bg-panel px-3.5 py-1.5 hover:border-accent"
                >
                  やめる
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={pending}
                  className="rounded-full bg-red-700 px-3.5 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600"
                >
                  {pending ? "移しています…" : `${items.length} 通をゴミ箱へ移す`}
                </button>
              </div>
            </InfoDialog>,
            document.body,
          )
        : null}
    </>
  );
}
