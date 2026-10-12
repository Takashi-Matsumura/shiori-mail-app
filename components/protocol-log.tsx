"use client";

import { useState } from "react";

type Row = { id: number; time: string; proto: string; conn: string; dir: string; line: string };

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "imap", label: "IMAP(受信・閲覧)" },
  { key: "smtp", label: "SMTP(送信)" },
] as const;

export function ProtocolLog({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.proto === filter);
  return (
    <>
      <div className="flex gap-1 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-2.5 py-0.5 ${filter === f.key ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-panel"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-2 self-center text-muted">{shown.length} 行(新しいものが下)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-panel p-2 font-mono text-xs leading-5">
        {shown.length === 0 ? <p className="p-2 font-sans text-muted">まだ記録がありません。同期か送信をすると表示されます。</p> : null}
        {shown.map((r, i) => (
          <div
            key={r.id}
            // 接続が変わるところに区切り線を入れる
            className={`flex gap-2 ${i > 0 && shown[i - 1].conn !== r.conn ? "mt-2 border-t border-line pt-2" : ""}`}
          >
            <span className="shrink-0 text-muted">{r.time}</span>
            <span className="w-9 shrink-0 text-muted">{r.proto.toUpperCase()}</span>
            <span className={`w-3 shrink-0 font-bold ${r.dir === "C" ? "text-accent" : r.dir === "S" ? "text-amber-600" : "text-muted"}`}>
              {r.dir}
            </span>
            <span className={`whitespace-pre-wrap break-all ${r.dir === "-" ? "text-muted" : ""}`}>{r.line}</span>
          </div>
        ))}
      </div>
    </>
  );
}
