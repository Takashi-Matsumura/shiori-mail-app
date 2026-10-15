const STYLES: Record<string, string> = {
  要返信: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  情報共有: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  予定: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "請求・手続き": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  宣伝: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};

export function CategoryBadge({ category, priority }: { category: string; priority?: string | null }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-px text-[11px] font-medium ${STYLES[category] ?? STYLES["宣伝"]}`}>
      {category}
      {priority === "高" ? <span className="font-bold">!</span> : null}
    </span>
  );
}
