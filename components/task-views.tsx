"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ListIcon, TasksIcon } from "@/components/icons";
import { useStoredFlag } from "@/lib/client/use-stored-flag";
import type { TaskRow } from "@/lib/queries";

const TYPE_STYLES: Record<string, string> = {
  予定: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  締切: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  やること: "bg-accent-soft text-accent",
};
const typeStyle = (type: string) => TYPE_STYLES[type] ?? TYPE_STYLES["やること"];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" を年・月・日に分ける。形が違えば null。 */
function parseDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;

/** 今日の "YYYY-MM-DD"。サーバでは分からないので null(ブラウザで描き直す)。 */
function useToday() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const now = new Date();
      return dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
    },
    () => null,
  );
}

/** 予定・やることを、リストとカレンダーで切り替えて見せる。どちらで見るかはブラウザに保存する。 */
export function TaskViews({ tasks }: { tasks: TaskRow[] }) {
  const [calendar, setCalendar] = useStoredFlag("tasks:calendar", false);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="表示の切り替え" className="flex w-fit rounded-full border border-line bg-panel p-0.5 text-xs">
        {[
          { on: false, label: "リスト", icon: <ListIcon /> },
          { on: true, label: "カレンダー", icon: <TasksIcon /> },
        ].map((v) => (
          <button
            key={v.label}
            type="button"
            aria-pressed={calendar === v.on}
            onClick={() => setCalendar(v.on)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors [&_svg]:size-3.5 ${
              calendar === v.on ? "bg-accent font-medium text-panel" : "text-muted hover:text-foreground"
            }`}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
      </div>
      {calendar ? <TaskCalendar tasks={tasks} /> : <TaskList tasks={tasks} />}
    </div>
  );
}

function TaskList({ tasks }: { tasks: TaskRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((t, i) => (
        <li key={i}>
          <TaskCard task={t} />
        </li>
      ))}
    </ul>
  );
}

function TaskCard({ task: t, showDate = true }: { task: TaskRow; showDate?: boolean }) {
  return (
    <div className="flex gap-4 rounded-xl border border-line bg-panel p-3.5">
      {showDate ? <DateBlock date={t.item.date} time={t.item.time} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-px text-[11px] font-medium ${typeStyle(t.item.type)}`}>{t.item.type}</span>
          {!showDate && t.item.time ? <span className="text-xs tabular-nums text-muted">{t.item.time}</span> : null}
          <span className="font-medium">{t.item.title}</span>
        </div>
        {t.item.detail ? <p className="text-xs leading-relaxed text-muted">{t.item.detail}</p> : null}
        <Link
          href={`/mail/${t.mailbox}/${t.uid}`}
          className="mt-1 flex w-fit max-w-full items-baseline gap-2 rounded-lg bg-background px-2.5 py-1 text-xs hover:text-accent"
        >
          <span className="min-w-0 truncate">{t.subject || "(件名なし)"}</span>
          <span className="shrink-0 text-muted">{t.from}</span>
        </Link>
      </div>
    </div>
  );
}

/** 日付を、月・日・曜日の札にする。日付がなければ「日付なし」。 */
function DateBlock({ date, time }: { date: string; time: string }) {
  const p = parseDate(date);
  if (!p) {
    return (
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-muted">
        日付なし
      </div>
    );
  }
  const weekday = WEEKDAYS[new Date(p.y, p.mo - 1, p.d).getDay()];
  return (
    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-soft py-1.5 text-accent tabular-nums">
      <span className="text-[11px]">{p.mo}月</span>
      <span className="text-xl font-semibold leading-tight">{p.d}</span>
      <span className="text-[11px]">({weekday})</span>
      {time ? <span className="mt-0.5 text-[11px] text-muted">{time}</span> : null}
    </div>
  );
}

/** 1 マスに並べる件数。超えた分は「他 N 件」にまとめ、押すと下に一覧を出す。 */
const MAX_IN_CELL = 3;

function TaskCalendar({ tasks }: { tasks: TaskRow[] }) {
  const today = useToday();
  // 表示中の月(1 日の "YYYY-MM-01")と、下に一覧を出す日。null なら今日
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  if (!today) return <p className="text-muted">読み込み中…</p>;

  const base = parseDate(month ?? today)!;
  const first = new Date(base.y, base.mo - 1, 1);
  const daysInMonth = new Date(base.y, base.mo, 0).getDate();
  const shift = (delta: number) => {
    const d = new Date(base.y, base.mo - 1 + delta, 1);
    setMonth(dateKey(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const byDate = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!parseDate(t.item.date)) continue;
    byDate.set(t.item.date, [...(byDate.get(t.item.date) ?? []), t]);
  }
  const undated = tasks.filter((t) => !parseDate(t.item.date));
  const inMonth = tasks.filter((t) => t.item.date.startsWith(`${base.y}-${pad(base.mo)}-`)).length;

  // 日曜始まり。前月・翌月の分は空きマスにする
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKey(base.y, base.mo, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const day = selected ?? today;
  const dayTasks = byDate.get(day) ?? [];
  const dayParsed = parseDate(day)!;

  const navClass =
    "flex size-8 items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors hover:border-accent hover:text-accent [&_svg]:size-4";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-3.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label="前の月" title="前の月" className={navClass}>
            <ChevronLeftIcon />
          </button>
          <h2 className="min-w-28 text-center text-base font-semibold tabular-nums">
            {base.y}年{base.mo}月
          </h2>
          <button type="button" onClick={() => shift(1)} aria-label="次の月" title="次の月" className={navClass}>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(null);
              setSelected(null);
            }}
            className="rounded-full border border-line px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
          >
            今日
          </button>
          <span className="ml-auto text-xs text-muted">この月 {inMonth} 件</span>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={i === 0 ? "text-red-600 dark:text-red-400" : i === 6 ? "text-sky-700 dark:text-sky-400" : ""}>
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((key, i) => {
            if (!key) return <div key={`blank-${i}`} className="min-h-24 rounded-lg" />;
            const items = byDate.get(key) ?? [];
            const d = Number(key.slice(8));
            const isToday = key === today;
            const isSelected = key === day;
            const weekday = i % 7;
            return (
              <div
                key={key}
                className={`flex min-h-24 min-w-0 flex-col gap-0.5 rounded-lg border p-1 ${
                  isSelected ? "border-accent bg-accent-soft/50" : "border-line"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected(key)}
                  aria-label={`${base.mo}月${d}日(${items.length} 件)`}
                  aria-pressed={isSelected}
                  className={`flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums transition-colors ${
                    isToday
                      ? "bg-accent font-semibold text-panel"
                      : weekday === 0
                        ? "text-red-600 hover:bg-background dark:text-red-400"
                        : weekday === 6
                          ? "text-sky-700 hover:bg-background dark:text-sky-400"
                          : "hover:bg-background"
                  }`}
                >
                  {d}
                </button>
                {items.slice(0, MAX_IN_CELL).map((t, j) => (
                  <Link
                    key={j}
                    href={`/mail/${t.mailbox}/${t.uid}`}
                    title={`${t.item.time ? `${t.item.time} ` : ""}${t.item.title}`}
                    className={`truncate rounded px-1 py-px text-[11px] leading-snug hover:opacity-80 ${typeStyle(t.item.type)}`}
                  >
                    {t.item.time ? <span className="tabular-nums">{t.item.time} </span> : null}
                    {t.item.title}
                  </Link>
                ))}
                {items.length > MAX_IN_CELL ? (
                  <button type="button" onClick={() => setSelected(key)} className="text-left text-[11px] text-muted hover:text-accent">
                    他 {items.length - MAX_IN_CELL} 件
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">
          {dayParsed.mo}月{dayParsed.d}日({WEEKDAYS[new Date(dayParsed.y, dayParsed.mo - 1, dayParsed.d).getDay()]})
          <span className="ml-1.5 text-xs font-normal text-muted">{dayTasks.length} 件</span>
        </h2>
        {dayTasks.length === 0 ? (
          <p className="text-muted">この日の予定・やることはありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dayTasks.map((t, i) => (
              <li key={i}>
                <TaskCard task={t} showDate={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {undated.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">
            日付なし<span className="ml-1.5 text-xs font-normal text-muted">{undated.length} 件</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {undated.map((t, i) => (
              <li key={i}>
                <TaskCard task={t} showDate={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
