/** --tint は下地の色、--ink は字の色。見た目は globals.css の .aqua-pill に置いてある */
const STYLES: Record<string, string> = {
  要返信: "[--tint:#e0483d] [--ink:#7f1d1d] dark:[--ink:#fecaca]",
  情報共有: "[--tint:#2b8fd6] [--ink:#0c4a6e] dark:[--ink:#bae6fd]",
  予定: "[--tint:#2f9e6a] [--ink:#065f46] dark:[--ink:#a7f3d0]",
  "請求・手続き": "[--tint:#e3a21a] [--ink:#78350f] dark:[--ink:#fde68a]",
  宣伝: "[--tint:#9a948c] [--ink:#44403c] dark:[--ink:#d6d3d1]",
  迷惑: "[--tint:#8a5cc7] [--ink:#4c1d95] dark:[--ink:#ddd6fe]",
};

export function CategoryBadge({ category, priority }: { category: string; priority?: string | null }) {
  return (
    <span className={`aqua-pill inline-flex shrink-0 items-center gap-0.5 px-2 py-px text-[11px] font-medium ${STYLES[category] ?? STYLES["宣伝"]}`}>
      {category}
      {priority === "高" ? <span className="font-bold">!</span> : null}
    </span>
  );
}
