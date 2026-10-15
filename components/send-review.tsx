import { AiMeta } from "@/components/ai-meta";
import { CheckIcon, SparkleIcon } from "@/components/icons";
import type { ReviewState } from "@/lib/client/use-send-review";

/** 栞による送信前の見直しの結果。指摘は参考で、送るかどうかは利用者が決める。 */
export function SendReview({ state }: { state: ReviewState }) {
  if (state.status === "idle") return null;
  return (
    <section aria-live="polite" className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5">
      <p className="flex items-center gap-1.5 font-medium text-accent [&_svg]:size-4">
        <SparkleIcon />
        送信前の見直し
      </p>
      {state.status === "running" ? (
        <p className="flex items-center gap-2 text-muted">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-accent" />
          栞が宛先と本文を読み返しています…
        </p>
      ) : state.status === "failed" ? (
        <p role="alert" className="text-red-600">{state.message}</p>
      ) : (
        <>
          {state.result.issues.length === 0 ? (
            <p className="flex items-center gap-1.5 [&_svg]:size-4 [&_svg]:text-accent">
              <CheckIcon />
              {state.result.error ? "決まりごとの点検では問題ありません" : "気になる点は見つかりませんでした"}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {state.result.issues.map((issue, i) => (
                <li key={i} className="flex flex-col gap-1 rounded-lg bg-background p-2.5">
                  <span
                    className={`w-fit rounded-full px-2 py-px text-[11px] font-medium ${
                      issue.severity === "要修正"
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                        : "bg-accent-soft text-accent"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span className="leading-relaxed">{issue.message}</span>
                  {issue.quote ? <q className="break-all text-xs text-muted">{issue.quote}</q> : null}
                </li>
              ))}
            </ul>
          )}
          {state.result.summary ? <p className="text-xs leading-relaxed text-muted">{state.result.summary}</p> : null}
          {state.result.error ? (
            <p className="text-xs text-red-600">栞に頼めなかったので、決まりごとの点検だけ行いました。{state.result.error}</p>
          ) : null}
          {state.result.meta ? <AiMeta {...state.result.meta} /> : null}
          <p className="text-xs text-muted">指摘は参考です。直したら、チェックを入れ直すと見直し直します。</p>
        </>
      )}
    </section>
  );
}
