import Link from "next/link";
import { Suspense } from "react";
import { BatchButton } from "@/components/batch-button";
import { requireAccount } from "@/lib/accounts";
import { AiError } from "@/lib/ai/client";
import { semanticSearch } from "@/lib/ai/ops";
import { seconds, shortDate } from "@/lib/format";
import { getMessageById, getPendingCounts, keywordSearch, type SearchHit } from "@/lib/queries";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">検索</h1>
        <p className="text-muted">
          同じ言葉で 2 通りに探して、結果を並べます。キーワード検索は「その文字を含むか」、意味検索は
          「文章を数百個の数値(埋め込みベクトル)にして、向きが近いか」で探します。
        </p>
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
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          aria-label="検索語"
          placeholder="例: お金を払う必要があるもの"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 focus:border-accent focus:outline-none"
        />
        <button className="shrink-0 rounded-md bg-accent px-4 py-2 font-medium text-panel hover:opacity-90">検索</button>
      </form>
      <div className="rounded-lg border border-line bg-panel p-3">
        <p className="mb-2 text-xs text-muted">意味検索を使うには、先にメールを埋め込みベクトルにしておく必要があります。</p>
        <BatchButton kind="embed" label="メールを索引に入れる" pending={pending.embed} />
      </div>
      {q ? (
        <div className="grid grid-cols-2 gap-4">
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
  return <Results title="キーワード検索" note="件名・本文・差出人に語を含むもの(新しい順)" hits={hits} />;
}

async function SemanticResults({ account, q }: { account: string; q: string }) {
  let result;
  try {
    result = await semanticSearch(account, q);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return <Results title="意味検索" note={e.message} hits={[]} error />;
  }
  if (result.indexed === 0) return <Results title="意味検索" note="まだ索引がありません。上のボタンで作成してください。" hits={[]} />;
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
      note={`類似度の高い順 ・ ${result.indexed} 通から ${seconds(result.ms)} ・ ${result.model}`}
      hits={hits}
    />
  );
}

function Results({ title, note, hits, error }: { title: string; note: string; hits: SearchHit[]; error?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-semibold">
        {title} <span className="text-xs font-normal text-muted">{hits.length} 件</span>
      </h2>
      <p className={`text-xs ${error ? "text-red-600" : "text-muted"}`}>{note}</p>
      <ul className="flex flex-col rounded-lg border border-line bg-panel">
        {hits.length === 0 ? <li className="p-3 text-muted">該当なし</li> : null}
        {hits.map((h) => (
          <li key={h.id} className="border-b border-line last:border-b-0">
            <Link href={`/mail/${h.mailbox}/${h.uid}`} className="block px-3 py-2 hover:bg-background">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{h.subject || "(件名なし)"}</span>
                {h.score != null ? <span className="shrink-0 font-mono text-xs text-accent">{h.score.toFixed(3)}</span> : null}
              </div>
              <p className="truncate text-xs text-muted">
                {h.from} ・ {shortDate(h.date)} ・ {h.snippet.replace(/\s+/g, " ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
