"use client";

import { useId, useState } from "react";
import { usePalette } from "@/lib/client/use-palette";
import { PALETTES } from "@/lib/palette";

/**
 * 設定画面の配色の選択。選んだ時点で切り替わり、このブラウザに保存する(保存ボタンは要らない)。
 * めったに変えないので、ふだんは畳んで今の配色だけを見せる。
 */
export function PalettePicker() {
  const [palette, setPalette] = usePalette();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const current = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
      <legend className="px-1 font-semibold">テーマカラー</legend>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <Swatch colors={current.swatch} small />
          {current.name}
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background"
        >
          {open ? "隠す" : "変更する"}
        </button>
      </div>
      <div id={panelId} hidden={!open} className="mt-1 flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {PALETTES.map((p) => {
            const selected = p.id === palette;
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                  selected ? "border-accent bg-accent-soft" : "border-line hover:bg-background"
                }`}
              >
                <input
                  type="radio"
                  name="palette"
                  value={p.id}
                  checked={selected}
                  onChange={() => setPalette(p.id)}
                  className="sr-only"
                />
                <Swatch colors={p.swatch} />
                <span className="flex min-w-0 flex-col">
                  <span className={selected ? "font-semibold text-accent" : ""}>{p.name}</span>
                  <span className="text-xs text-muted">{p.yomi}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted">選ぶとすぐに切り替わります。配色はこのブラウザに保存するので、別の端末やブラウザでは選び直してください。</p>
      </div>
    </fieldset>
  );
}

function Swatch({ colors, small = false }: { colors: readonly string[]; small?: boolean }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded border border-line">
      {colors.map((c) => (
        <span key={c} className={small ? "h-4 w-2.5" : "h-7 w-4"} style={{ background: c }} />
      ))}
    </span>
  );
}
