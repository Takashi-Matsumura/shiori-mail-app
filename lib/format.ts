const pad = (n: number) => String(n).padStart(2, "0");

/** 一覧用の短い日時(例: 10/13 05:40)。 */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fullDate(ms: number): string {
  const d = new Date(ms);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

/** 合計時間向けの表記(例: 42 秒 / 11 分 5 秒)。 */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}
