import { seconds } from "@/lib/format";

/** AI の結果に添える計測値。便利さと待ち時間を見比べるための表示。 */
export function AiMeta({ ms, model, promptTokens, completionTokens }: {
  ms: number;
  model?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
}) {
  const parts = [seconds(ms)];
  if (promptTokens != null && completionTokens != null) parts.push(`入力 ${promptTokens} + 出力 ${completionTokens} トークン`);
  if (model) parts.push(model);
  return <p className="text-xs text-muted">{parts.join(" ・ ")}</p>;
}
