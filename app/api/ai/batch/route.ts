import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { classifyMessage, closureForMessage, embedMessage, extractFromMessage, type BatchKind } from "@/lib/ai/ops";
import { CLOSURE_PENDING_SQL } from "@/lib/queries";
import { isSameOrigin, ndjsonResponse } from "@/lib/ai/stream";
import { getDb } from "@/lib/db";
import { getMessageById, type MessageRow } from "@/lib/queries";

const RUNNERS: Record<BatchKind, (m: MessageRow) => Promise<{ ms: number; summary: string }>> = {
  classify: classifyMessage,
  extract: extractFromMessage,
  embed: embedMessage,
  closure: closureForMessage,
};

/** まだ処理していないメールの id を新しい順に返す。分類と抽出は受信トレイだけが対象。 */
function pendingIds(account: string, kind: BatchKind): number[] {
  if (kind === "closure") {
    return (getDb().prepare(`SELECT m.id FROM messages m WHERE m.account = ? AND ${CLOSURE_PENDING_SQL} ORDER BY m.date DESC`).all(account) as { id: number }[]).map(
      (r) => r.id,
    );
  }
  const sql =
    kind === "embed"
      ? "SELECT m.id FROM messages m WHERE m.account = ? AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.message_id = m.id) ORDER BY m.date DESC"
      : "SELECT m.id FROM messages m WHERE m.account = ? AND m.mailbox = 'inbox' AND NOT EXISTS (SELECT 1 FROM ai_results a WHERE a.message_id = m.id AND a.kind = ?) ORDER BY m.date DESC";
  const rows = (kind === "embed" ? getDb().prepare(sql).all(account) : getDb().prepare(sql).all(account, kind)) as { id: number }[];
  return rows.map((r) => r.id);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null;
  const kind = body?.kind;
  if (kind !== "classify" && kind !== "extract" && kind !== "embed" && kind !== "closure") return new Response("Bad Request", { status: 400 });

  const account = getAccount();
  if (!account) return new Response("アカウントが未設定です", { status: 409 });
  // id 指定なら 1 通だけ(やり直しを含む)、無ければ未処理をすべて
  const ids = body?.id === undefined ? pendingIds(account.id, kind) : [Number(body.id)];
  if (ids.some((id) => !Number.isInteger(id))) return new Response("Bad Request", { status: 400 });

  return ndjsonResponse(async (send) => {
    const started = Date.now();
    let done = 0;
    for (const id of ids) {
      // 閉じられたタブのために処理を続けない
      if (request.signal.aborted) return;
      const m = await getMessageById(account.id, id);
      if (m) {
        // 1 通だけのやり直しは、利用者が「AI に聞き直したい」と押したものなので、近傍法を飛ばして会話用モデルに聞く
        const r = kind === "classify" && body?.id !== undefined ? await classifyMessage(m, { preferLlm: true }) : await RUNNERS[kind](m);
        send({ t: "progress", done: ++done, total: ids.length, label: m.subject, note: `${r.summary}(${(r.ms / 1000).toFixed(1)} 秒)` });
      }
    }
    send({ t: "done", ms: Date.now() - started });
  });
}
