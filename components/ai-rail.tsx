import { getAccount } from "@/lib/accounts";
import { getAiConfig, isLoopbackUrl } from "@/lib/ai/config";
import { ITEM_TYPES } from "@/lib/ai/prompts";
import { getAiStats } from "@/lib/queries";

/** 畳んだ右パネルに出す帯。処理の進み具合と、要点の数字だけを縦に並べる。 */
export async function AiRail() {
  const cfg = getAiConfig();
  const account = getAccount();
  if (!account) return null;
  const stats = await getAiStats(account.id);
  const countOf = (kind: string) => stats.runs.filter((r) => r.kind === kind).reduce((n, r) => n + r.count, 0);
  const classified = countOf("classify");
  const high = stats.priorities["高"] ?? 0;
  const items = ITEM_TYPES.reduce((n, t) => n + (stats.items[t] ?? 0), 0);
  const staysLocal = isLoopbackUrl(cfg.baseUrl) && isLoopbackUrl(cfg.embedBaseUrl);
  return (
    <div className="flex flex-col items-center gap-3 px-1 pb-3 text-[10px] leading-tight text-muted">
      <Ring label="仕分け" short="仕分け" done={classified} total={stats.inbox} />
      <Ring label="予定の抜き出し" short="抜出し" done={countOf("extract")} total={stats.inbox} />
      <Ring label="検索用の索引" short="索引" done={stats.embedded} total={stats.all} />
      <span className="h-px w-6 bg-line" />
      <Figure value={high} short="優先 高" title={`仕分けた ${classified} 通のうち ${high} 通が優先度「高」`} />
      <Figure value={items} short="項目" title={`予定・締切・やることを ${items} 件抜き出しました`} />
      <span className="h-px w-6 bg-line" />
      <p
        className="text-center"
        title={staysLocal ? "いまの設定では、メールはこのマシンの中だけで処理されます。" : "いまの設定では、メールがこのマシンの外の AI へ送られます。"}
      >
        <span aria-hidden="true" className="block text-sm text-foreground">
          {staysLocal ? "●" : "↗"}
        </span>
        {staysLocal ? "端末内" : "外部へ"}
      </p>
    </div>
  );
}

function Figure({ value, short, title }: { value: number; short: string; title: string }) {
  return (
    <p className="text-center" title={title}>
      <span className="block text-base font-semibold text-foreground">{value}</span>
      {short}
    </p>
  );
}

const R = 12;
const LENGTH = 2 * Math.PI * R;

/** 対象のうち何通を処理したかの輪。中の数字は処理済みの通数。 */
function Ring({ label, short, done, total }: { label: string; short: string; done: number; total: number }) {
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${label}: ${done} / ${total} 通`}>
      <svg width="32" height="32" viewBox="0 0 32 32" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <circle cx="16" cy="16" r={R} fill="none" strokeWidth="3" style={{ stroke: "var(--accent-soft)" }} />
        <circle
          cx="16"
          cy="16"
          r={R}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${ratio * LENGTH} ${LENGTH}`}
          transform="rotate(-90 16 16)"
          style={{ stroke: "var(--accent)" }}
        />
        <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fontSize="10" style={{ fill: "var(--foreground)" }}>
          {done}
        </text>
      </svg>
      {short}
    </div>
  );
}
