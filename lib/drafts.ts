import "server-only";
import { getDb } from "@/lib/db";

export type ComposeDraftFields = { to: string; cc: string; subject: string; body: string; includeQuote: boolean };
export type ComposeDraft = ComposeDraftFields & { savedAt: number };

/** 書いてから長く放っておいた書きかけは、もう要らないものとして出さない(読むときと保存するときに消す) */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const KIND = /^(new|reply-\d+|forward-\d+)$/;

export const isDraftKind = (kind: unknown): kind is string => typeof kind === "string" && KIND.test(kind);

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
