import Link from "next/link";
import { Suspense } from "react";
import { BatchButton } from "@/components/batch-button";
import { requireAccount } from "@/lib/accounts";
import { listTasks } from "@/lib/queries";

export default function TasksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">予定・やること</h1>
        <p className="text-muted">
          受信トレイのメールから、栞が日時のある予定・締切・依頼を抜き出した一覧です。日付の読み違いが起こりうるので、元のメールで確かめてください。
        </p>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Tasks />
        </Suspense>
      </div>
    </div>
  );
}

async function Tasks() {
  const account = requireAccount();
  const { tasks, pending, done } = await listTasks(account.id);
  return (
    <>
      <div className="rounded-lg border border-line bg-panel p-3">
        <BatchButton kind="extract" label="未処理のメールから抜き出す" pending={pending} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-muted">{done === 0 ? "まだ抜き出していません。" : "抜き出せる項目はありませんでした。"}</p>
      ) : (
        <table className="w-full border-collapse rounded-lg border border-line bg-panel">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-3 py-2 font-normal">日付</th>
              <th className="px-3 py-2 font-normal">種類</th>
              <th className="px-3 py-2 font-normal">内容</th>
              <th className="px-3 py-2 font-normal">元のメール</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {t.item.date || <span className="text-muted">日付なし</span>} {t.item.time}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{t.item.type}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{t.item.title}</p>
                  <p className="text-xs text-muted">{t.item.detail}</p>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/mail/${t.mailbox}/${t.uid}`} className="text-accent underline">
                    {t.subject || "(件名なし)"}
                  </Link>
                  <p className="text-xs text-muted">{t.from}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
