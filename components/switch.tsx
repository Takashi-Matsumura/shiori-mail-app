"use client";

import { useId } from "react";

/** ON / OFF を切り替えるスイッチ。項目名を押しても切り替わる。 */
export function Switch({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** マウスを乗せたときに出す説明 */
  title?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2" title={title}>
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
          checked ? "border-accent bg-accent" : "border-line bg-line"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-4 rounded-full bg-panel shadow-sm transition-transform motion-reduce:transition-none ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
