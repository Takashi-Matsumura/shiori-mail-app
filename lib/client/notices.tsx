"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * 画面上端のヘッダーに出すお知らせ。出どころ(source)ごとに 1 件だけ持ち、同じ出どころの新しいお知らせで置き換える。
 * - error: 閉じるまで残す
 * - info: 一定時間で消える
 * - progress: 置き換えられるか消されるまで残す(進み具合の表示)
 */
export type NoticeKind = "info" | "error" | "progress";
export type Notice = { source: string; kind: NoticeKind; text: string };

const INFO_MS = 6_000;

type Api = {
  notices: Notice[];
  notify: (notice: Notice) => void;
  dismiss: (source: string) => void;
};

const NoticeContext = createContext<Api | null>(null);

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((source: string) => {
    clearTimeout(timers.current.get(source));
    timers.current.delete(source);
    setNotices((list) => list.filter((n) => n.source !== source));
  }, []);

  const notify = useCallback(
    (notice: Notice) => {
      clearTimeout(timers.current.get(notice.source));
      timers.current.delete(notice.source);
      setNotices((list) => [...list.filter((n) => n.source !== notice.source), notice]);
      if (notice.kind === "info") timers.current.set(notice.source, setTimeout(() => dismiss(notice.source), INFO_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ notices, notify, dismiss }), [notices, notify, dismiss]);
  return <NoticeContext.Provider value={api}>{children}</NoticeContext.Provider>;
}

export function useNotices(): Api {
  const api = useContext(NoticeContext);
  if (!api) throw new Error("NoticeProvider の内側で使ってください");
  return api;
}
