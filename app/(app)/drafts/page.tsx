import Link from "next/link";
import { Suspense } from "react";
import { DraftDeleteButton } from "@/components/draft-delete-button";
import { requireAccount } from "@/lib/accounts";
import { listDrafts, type DraftListItem } from "@/lib/drafts";
import { shortDate } from "@/lib/format";

const TYPE_LABEL: Record<DraftListItem["type"], string> = { new: "新規", reply: "返信", forward: "転送" };

export default function DraftsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">下書き</h1>
          <p className="text-xs text-muted">
            作成画面の書きかけは自動で保存されます。送信すると一覧から消え、14 日たったものも消えます。
          </p>
        </div>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Drafts />
        </Suspense>
      </div>
    </div>
  );
}

async function Drafts() {
  requireAccount();
  const drafts = await listDrafts();
  if (drafts.length === 0) return <p className="text-muted">下書きはありません。</p>;
  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {drafts.map((d) => (
        <li key={d.kind} className="flex items-center gap-2 pr-2 hover:bg-background">
          <Link href={d.href} className="flex min-w-0 flex-1 flex-col gap-0.5 px-3.5 py-2.5">
            <span className="flex items-baseline gap-2">
              <span className="shrink-0 rounded-full border border-line px-2 text-[11px] text-muted">{TYPE_LABEL[d.type]}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{d.subject || "(件名なし)"}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{shortDate(d.savedAt)}</span>
            </span>
            <span className="truncate text-xs text-muted">
              {d.to ? `宛先: ${d.to}` : "宛先: 未入力"}
              {d.snippet ? ` ・ ${d.snippet}` : ""}
            </span>
          </Link>
          <DraftDeleteButton kind={d.kind} subject={d.subject} />
        </li>
      ))}
    </ul>
  );
}
