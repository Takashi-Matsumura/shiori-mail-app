import Link from "next/link";
import { Suspense } from "react";
import { AquaButton } from "@/components/aqua-button";
import { BatchButton } from "@/components/batch-button";
import { SearchIcon, SparkleIcon } from "@/components/icons";
import { InfoButton } from "@/components/info-button";
import { HELP } from "@/lib/help-texts";
import { requireAccount } from "@/lib/accounts";
import { AiError } from "@/lib/ai/client";
import { semanticSearch } from "@/lib/ai/ops";
import { seconds, shortDate } from "@/lib/format";
import { getMessageById, getPendingCounts, keywordSearch, type SearchHit } from "@/lib/queries";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="flex items-center gap-1.5 text-xl font-semibold">
          検索
          <InfoButton title="検索" markdown={HELP.search} />
        </h1>
        <Suspense fallback={<p className="text-muted">読み込み中…</p>}>
          <Search searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Search({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const account = requireAccount();
  const pending = await getPendingCounts(account.id);
  return (
    <>
      <form role="search" className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
            <SearchIcon />
          </span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            aria-label="検索語"
            placeholder="例: お金を払う必要があるもの"
            className="w-full rounded-xl border border-line bg-panel py-2.5 pl-10 pr-3.5 focus:border-accent focus:outline-none"
          />
        </div>
        <AquaButton type="submit" label="検索">
          <SearchIcon />
        </AquaButton>
      </form>
      <div className="rounded-xl border border-line bg-panel p-3.5">
        <BatchButton kind="embed" label="メールを索引に入れる" pending={pending.embed} />
      </div>
      {q ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Suspense fallback={<p className="text-muted">検索中…</p>}>
            <KeywordResults account={account.id} q={q} />
          </Suspense>
          <Suspense fallback={<p className="text-muted">栞が探しています…</p>}>
            <SemanticResults account={account.id} q={q} />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}

async function KeywordResults({ account, q }: { account: string; q: string }) {
  const hits = await keywordSearch(account, q);
  return <Results title="キーワード検索" icon={<SearchIcon />} note="件名・本文・差出人に語を含むもの(新しい順)" hits={hits} />;
}

async function SemanticResults({ account, q }: { account: string; q: string }) {
  let result;
  try {
    result = await semanticSearch(account, q);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return <Results title="意味検索" icon={<SparkleIcon />} note={e.message} hits={[]} error />;
  }
  if (result.indexed === 0) return <Results title="意味検索" icon={<SparkleIcon />} note="まだ索引がありません。上のボタンで作成してください。" hits={[]} />;
  const hits: SearchHit[] = [];
  for (const h of result.hits) {
    const m = await getMessageById(account, h.messageId);
    if (m) {
      hits.push({ id: m.id, uid: m.uid, mailbox: m.mailbox, subject: m.subject, from: m.from_name || m.from_addr, date: m.date, snippet: m.text.slice(0, 140), score: h.score });
    }
  }
  return (
    <Results
      title="意味検索"
      icon={<SparkleIcon />}
      note={`類似度の高い順 ・ ${result.indexed} 通から ${seconds(result.ms)} ・ ${result.model}`}
      hits={hits}
    />
  );
}

function Results({ title, icon, note, hits, error }: { title: string; icon: React.ReactNode; note: string; hits: SearchHit[]; error?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-1.5 font-medium text-accent [&_svg]:size-4">
          {icon}
          {title}
          <span className="text-xs font-normal text-muted">{hits.length} 件</span>
        </h2>
        <p className={`text-xs ${error ? "text-red-600" : "text-muted"}`}>{note}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {hits.length === 0 ? <li className="px-2.5 py-2 text-muted">該当なし</li> : null}
        {hits.map((h) => (
          <li key={h.id}>
            <Link
              href={`/mail/${h.mailbox}/${h.uid}`}
              className="flex flex-col gap-0.5 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-line hover:bg-background"
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{h.subject || "(件名なし)"}</span>
                {h.score != null ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-px font-mono text-[11px] text-accent" title="類似度">
                    {h.score.toFixed(3)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-baseline gap-2 text-xs text-muted">
                <span className="min-w-0 truncate">{h.from}</span>
                <span className="shrink-0 tabular-nums">{shortDate(h.date)}</span>
              </div>
              <p className="truncate text-xs text-muted">{h.snippet.replace(/\s+/g, " ")}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
