"use client";

import { useId, useState } from "react";
import { DisclosureButton } from "@/components/disclosure-button";
import { InfoButton } from "@/components/info-button";
import { HELP } from "@/lib/help-texts";
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
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-5">
      <legend className="flex items-center gap-1 px-1 font-semibold">
        テーマカラー
        <InfoButton title="テーマカラー" markdown={HELP.palette} />
      </legend>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <Swatch colors={current.swatch} small />
          {current.name}
        </p>
        <DisclosureButton open={open} onToggle={() => setOpen(!open)} controls={panelId} label="テーマカラー" />
      </div>
      <div id={panelId} hidden={!open} className="mt-3 flex flex-col gap-3">
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
