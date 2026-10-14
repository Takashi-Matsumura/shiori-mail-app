import { getActiveAccount } from "@/lib/accounts";
import { getAiConfig, isLoopbackUrl } from "@/lib/ai/config";
import { CATEGORIES, ITEM_TYPES } from "@/lib/ai/prompts";
import { duration, seconds } from "@/lib/format";
import { getAiStats, type AiRunStat } from "@/lib/queries";

const KIND_LABEL: Record<string, string> = {
  classify: "仕分け",
  extract: "予定の抜き出し",
  summary: "要約",
  thread_summary: "スレッド要約",
};

// 人が読む速さの目安。日本語の黙読でよく使われる値で、あくまで換算用
const READING_CHARS_PER_MIN = 500;

const sum = (rows: AiRunStat[], key: "count" | "totalMs" | "promptTokens" | "completionTokens") => rows.reduce((n, r) => n + r[key], 0);

/** 右パネル。ローカル AI がどこまで処理したかと、その結果どれだけ手間が減ったかを数字で見せる。 */
export async function AiInsights() {
  const account = getActiveAccount();
  const cfg = getAiConfig();
  const stats = await getAiStats(account.id);
  const countOf = (kind: string) => sum(stats.runs.filter((r) => r.kind === kind), "count");
  const classified = countOf("classify");
  const staysLocal = isLoopbackUrl(cfg.baseUrl) && isLoopbackUrl(cfg.embedBaseUrl);
  const high = stats.priorities["高"] ?? 0;
  const maxCategory = Math.max(1, ...CATEGORIES.map((c) => stats.categories[c] ?? 0));
  const itemTotal = ITEM_TYPES.reduce((n, t) => n + (stats.items[t] ?? 0), 0);

  return (
    <div className="flex flex-col gap-5 p-4 pt-0">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">AI の働き</h2>
        <p className="text-xs text-muted">
          {staysLocal
            ? "いまの設定では、メールはこのマシンの中だけで処理されます。"
            : "いまの設定では、メールがこのマシンの外の AI へ送られます。"}
        </p>
      </header>

      <Section title="処理状況">
        <Meter label="仕分け" done={classified} total={stats.inbox} />
        <Meter label="予定の抜き出し" done={countOf("extract")} total={stats.inbox} />
        <Meter label="検索用の索引" done={stats.embedded} total={stats.all} />
        <p className="text-xs text-muted">
          要約 {countOf("summary")} 通 ・ スレッド要約 {countOf("thread_summary")} 件(開いたメールで都度実行)
        </p>
      </Section>

      <Section title="仕分けの結果">
        {classified === 0 ? (
          <Empty>まだ仕分けていません。</Empty>
        ) : (
          <>
            <p>
              <span className="text-3xl font-semibold">{high}</span>
              <span className="ml-1 text-muted">/ {classified} 通が優先度「高」</span>
            </p>
            <p className="text-xs text-muted">
              中 {stats.priorities["中"] ?? 0} 通 ・ 低 {stats.priorities["低"] ?? 0} 通は後回しにできます。
            </p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {CATEGORIES.map((c) => {
                const n = stats.categories[c] ?? 0;
                return (
                  <li key={c} className="grid grid-cols-[5.5rem_1fr_1.5rem] items-center gap-2 text-xs" title={`${c}: ${n} 通`}>
                    <span className="truncate">{c}</span>
                    <span className="h-2">
                      <span className="block h-2 rounded-r bg-accent" style={{ width: `${(n / maxCategory) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section title="抜き出した項目">
        {countOf("extract") === 0 ? (
          <Empty>まだ抜き出していません。</Empty>
        ) : (
          <>
            <p>
              <span className="text-3xl font-semibold">{itemTotal}</span>
              <span className="ml-1 text-muted">件を {countOf("extract")} 通から</span>
            </p>
            <p className="text-xs text-muted">{ITEM_TYPES.map((t) => `${t} ${stats.items[t] ?? 0} 件`).join(" ・ ")}</p>
          </>
        )}
      </Section>

      <Section title="かかった時間">
        {stats.runs.length === 0 ? (
          <Empty>まだ記録がありません。</Empty>
        ) : (
          <>
            <table className="w-full table-fixed text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-1 text-left font-normal">処理</th>
                  <th className="w-10 whitespace-nowrap pb-1 text-right font-normal">件数</th>
                  <th className="w-20 whitespace-nowrap pb-1 text-right font-normal">1 件あたり</th>
                </tr>
              </thead>
              <tbody>
                {stats.runs.map((r) => (
                  <tr key={`${r.kind}:${r.model}`} className="border-t border-line align-top">
                    <td className="py-1">
                      {KIND_LABEL[r.kind] ?? r.kind}
                      <span className="block truncate text-muted" title={r.model}>
                        {r.model}
                      </span>
                    </td>
                    <td className="py-1 text-right tabular-nums">{r.count}</td>
                    <td className="whitespace-nowrap py-1 text-right tabular-nums">{seconds(r.avgMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-xs">
              <dt className="text-muted">AI の処理時間(合計)</dt>
              <dd className="text-right tabular-nums">{duration(sum(stats.runs, "totalMs"))}</dd>
              <dt className="text-muted">読ませた本文</dt>
              <dd className="text-right tabular-nums">{stats.chars.toLocaleString("ja-JP")} 字</dd>
              <dt className="text-muted">人が読む場合の目安</dt>
              <dd className="text-right tabular-nums">約 {duration((stats.chars / READING_CHARS_PER_MIN) * 60_000)}</dd>
              <dt className="text-muted">トークン(入力 / 出力)</dt>
              <dd className="text-right tabular-nums">
                {sum(stats.runs, "promptTokens").toLocaleString("ja-JP")} / {sum(stats.runs, "completionTokens").toLocaleString("ja-JP")}
              </dd>
            </dl>
            <p className="text-xs text-muted">目安は毎分 {READING_CHARS_PER_MIN} 字で換算。AI の処理は裏で進むので、待っている必要はありません。</p>
          </>
        )}
      </Section>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="text-xs text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}

/** 対象のうち何通を処理したか。塗りは accent、残りは同じ色の薄い段(accent-soft)。 */
function Meter({ label, done, total }: { label: string; done: number; total: number }) {
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {done} / {total} 通
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-accent-soft"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
