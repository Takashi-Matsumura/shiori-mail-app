import { Suspense } from "react";
import { BatchButton } from "@/components/batch-button";
import { InfoButton } from "@/components/info-button";
import { TaskViews } from "@/components/task-views";
import { requireAccount } from "@/lib/accounts";
import { listTasks } from "@/lib/queries";

export default function TasksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold">
          予定・やること
          <InfoButton title="予定・やること">
            <p>受信トレイのメールから、栞が日時のある予定・締切・依頼を抜き出した一覧です。日付の早い順に並べ、日付のないものは最後に置きます。</p>
            <p>日付の読み違いが起こりうるので、元のメールで確かめてください。</p>
          </InfoButton>
        </h1>
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
      <div className="rounded-xl border border-line bg-panel p-3.5">
        <BatchButton kind="extract" label="未処理のメールから抜き出す" pending={pending} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-muted">{done === 0 ? "まだ抜き出していません。" : "抜き出せる項目はありませんでした。"}</p>
      ) : (
        <TaskViews tasks={tasks} />
      )}
    </>
  );
}
