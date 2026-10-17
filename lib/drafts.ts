import "server-only";
import { io } from "next/cache";
import { connection } from "next/server";
import { getDb } from "@/lib/db";

export type ComposeDraftFields = { to: string; cc: string; subject: string; body: string; includeQuote: boolean };
export type ComposeDraft = ComposeDraftFields & { savedAt: number };

/** 書いてから長く放っておいた書きかけは、もう要らないものとして出さない(読むときと保存するときに消す) */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// new-<乱数> は新規作成(1 通ごとに分ける)。new だけのものは、分ける前に保存した書きかけ
const KIND = /^(new(-[a-z0-9]{8,32})?|reply-\d+|forward-\d+)$/;

export const isDraftKind = (kind: unknown): kind is string => typeof kind === "string" && KIND.test(kind);

/** 新規作成を開くたびに、新しい書きかけの名前を作る(前の書きかけを上書きしないように) */
export async function newDraftKind(): Promise<string> {
  // 乱数はリクエストのたびに作る(事前描画で 1 つに固定されないように)
  await connection();
  return `new-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type DraftListItem = {
  kind: string;
  type: "new" | "reply" | "forward";
  /** 作成画面で開き直すときの URL */
  href: string;
  to: string;
  subject: string;
  snippet: string;
  savedAt: number;
};

/** 下書きの一覧(新しく保存した順) */
export async function listDrafts(): Promise<DraftListItem[]> {
  await io();
  purgeOld();
  const rows = getDb().prepare("SELECT kind, data, saved FROM compose_drafts ORDER BY saved DESC").all() as {
    kind: string;
    data: string;
    saved: number;
  }[];
  return rows.flatMap((r) => {
    if (!isDraftKind(r.kind)) return [];
    let d: ComposeDraftFields;
    try {
      d = JSON.parse(r.data) as ComposeDraftFields;
    } catch {
      return [];
    }
    const [type, id] = r.kind.startsWith("reply-") ? ["reply", r.kind.slice(6)] : r.kind.startsWith("forward-") ? ["forward", r.kind.slice(8)] : ["new", ""];
    const draft = `draft=${encodeURIComponent(r.kind)}`;
    return [
      {
        kind: r.kind,
        type: type as DraftListItem["type"],
        href: type === "new" ? `/compose?${draft}` : `/compose?${type}=${id}&${draft}`,
        to: d.to,
        subject: d.subject,
        snippet: d.body.replace(/\s+/g, " ").trim().slice(0, 120),
        savedAt: r.saved,
      },
    ];
  });
}

export async function countDrafts(): Promise<number> {
  await io();
  return (getDb().prepare("SELECT COUNT(*) AS n FROM compose_drafts WHERE saved >= ?").get(Date.now() - MAX_AGE_MS) as { n: number }).n;
}

function purgeOld(): void {
  getDb().prepare("DELETE FROM compose_drafts WHERE saved < ?").run(Date.now() - MAX_AGE_MS);
}

export function getDraft(kind: string): ComposeDraft | null {
  if (!isDraftKind(kind)) return null;
  purgeOld();
  const row = getDb().prepare("SELECT data, saved FROM compose_drafts WHERE kind = ?").get(kind) as
    | { data: string; saved: number }
    | undefined;
  if (!row) return null;
  try {
    return { ...(JSON.parse(row.data) as ComposeDraftFields), savedAt: row.saved };
  } catch {
    return null;
  }
}

/** 画面から来た値を確かめてから保存する。形がおかしければ保存しない */
export function saveDraft(kind: string, value: unknown): boolean {
  if (!isDraftKind(kind) || typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const text = (name: string, max: number) => (typeof v[name] === "string" ? (v[name] as string).slice(0, max) : null);
  const fields = {
    to: text("to", 2000),
    cc: text("cc", 2000),
    subject: text("subject", 500),
    body: text("body", 100_000),
    includeQuote: v.includeQuote !== false,
  };
  if (fields.to === null || fields.cc === null || fields.subject === null || fields.body === null) return false;
  purgeOld();
  getDb()
    .prepare(
      "INSERT INTO compose_drafts (kind, data, saved) VALUES (?, ?, ?) ON CONFLICT (kind) DO UPDATE SET data = excluded.data, saved = excluded.saved",
    )
    .run(kind, JSON.stringify(fields), Date.now());
  return true;
}

export function deleteDraft(kind: string): void {
  if (isDraftKind(kind)) getDb().prepare("DELETE FROM compose_drafts WHERE kind = ?").run(kind);
}
