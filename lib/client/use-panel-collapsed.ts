"use client";

import { useSyncExternalStore } from "react";
import { useStoredFlag } from "@/lib/client/use-stored-flag";

/**
 * 右パネルを最初から畳んでおく画面の幅(xl 未満)。右パネルが出る lg 以上でこの幅より狭いと、
 * 左のメニュー・一覧・右パネルで本文の列が 100px 前後まで細くなるため
 */
const RIGHT_NARROW_QUERY = "(width < 80rem)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * 左右のパネル(SidePanel)の開閉。右パネルは、狭い画面(RIGHT_NARROW_QUERY)では広い画面と別に覚え、最初は畳んでおく。
 * 狭い画面で開いても、広い画面での開閉の好みは変わらない。
 * SidePanel と PanelShortcuts で同じ状態を使う
 */
export function usePanelCollapsed(side: "left" | "right"): [boolean, (value: boolean) => void] {
  const narrow = useMediaQuery(RIGHT_NARROW_QUERY) && side === "right";
  const wide = useStoredFlag(`side-panel:${side}`, false);
  const narrowFlag = useStoredFlag(`side-panel:${side}:narrow`, true);
  return narrow ? narrowFlag : wide;
}
