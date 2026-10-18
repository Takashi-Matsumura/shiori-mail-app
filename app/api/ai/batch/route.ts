import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { AiError } from "@/lib/ai/client";
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

// そのメールだけ応答がおかしかった失敗は、しばらく経ってから少しだけやり直し、それでもだめなら放っておく。
// 1 通のために同じ失敗を 5 分ごとに繰り返したり、それより古いメールの処理が止まったりしないように
const RETRY_AFTER_MS = 24 * 60 * 60_000;
const MAX_ATTEMPTS = 3;
const MAX_PER_RUN = 100;
// 未処理の読み飛ばし条件(messages m に対して)
const NOT_SKIPPED_SQL = `NOT EXISTS (SELECT 1 FROM ai_failures f WHERE f.message_id = m.id AND f.kind = ? AND (f.attempts >= ? OR f.last_tried > ?))`;

/** まだ処理していないメールの id を新しい順に返す。分類と抽出は受信トレイだけが対象。 */
function pendingIds(account: string, kind: BatchKind): number[] {
  const db = getDb();
  const skip = [kind, MAX_ATTEMPTS, Date.now() - RETRY_AFTER_MS] as const;
  let rows: { id: number }[];
  if (kind === "closure") {
    rows = db.prepare(`SELECT m.id FROM messages m WHERE m.account = ? AND ${CLOSURE_PENDING_SQL} AND ${NOT_SKIPPED_SQL} ORDER BY m.date DESC`).all(account, ...skip) as { id: number }[];
  } else if (kind === "embed") {
    rows = db
      .prepare(
        `SELECT m.id FROM messages m WHERE m.account = ? AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.message_id = m.id) AND ${NOT_SKIPPED_SQL} ORDER BY m.date DESC`,
      )
      .all(account, ...skip) as { id: number }[];
  } else {
    rows = db
      .prepare(
        `SELECT m.id FROM messages m WHERE m.account = ? AND m.mailbox = 'inbox'
         AND NOT EXISTS (SELECT 1 FROM ai_results a WHERE a.message_id = m.id AND a.kind = ?) AND ${NOT_SKIPPED_SQL} ORDER BY m.date DESC`,
      )
      .all(account, kind, ...skip) as { id: number }[];
  }
  return rows.map((r) => r.id);
}

function recordFailure(messageId: number, kind: BatchKind, error: string): void {
  getDb()
    .prepare(
      `INSERT INTO ai_failures (message_id, kind, attempts, last_error, last_tried) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT (message_id, kind) DO UPDATE SET attempts = attempts + 1, last_error = excluded.last_error, last_tried = excluded.last_tried`,
    )
    .run(messageId, kind, error.slice(0, 300), Date.now());
}

function clearFailure(messageId: number, kind: BatchKind): void {
  getDb().prepare("DELETE FROM ai_failures WHERE message_id = ? AND kind = ?").run(messageId, kind);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null;
  const kind = body?.kind;
  if (kind !== "classify" && kind !== "extract" && kind !== "embed" && kind !== "closure") return new Response("Bad Request", { status: 400 });

  const account = getAccount();
  if (!account) return new Response("アカウントが未設定です", { status: 409 });
  // id 指定なら 1 通だけ(やり直しを含む。読み飛ばし中でも実行する)、無ければ未処理をすべて
  const single = body?.id !== undefined;
  // 1 回のリクエストで処理する件数には上限を置く。残りは次の自動処理(5 分ごと)が拾う
  const ids = single ? [Number(body!.id)] : pendingIds(account.id, kind).slice(0, MAX_PER_RUN);
  if (ids.some((id) => !Number.isInteger(id))) return new Response("Bad Request", { status: 400 });

  return ndjsonResponse(async (send) => {
    const started = Date.now();
    let done = 0;
    for (const id of ids) {
      // 閉じられたタブのために処理を続けない。ロックやログアウトでセッションが消えたときも、そこで止める
      if (request.signal.aborted || !(await isAuthenticated())) return;
      const m = await getMessageById(account.id, id);
      if (!m) continue;
      try {
        // 1 通だけのやり直しは、利用者が「AI に聞き直したい」と押したものなので、近傍法を飛ばして会話用モデルに聞く
        const r = kind === "classify" && single ? await classifyMessage(m, { preferLlm: true }) : await RUNNERS[kind](m);
        clearFailure(m.id, kind);
        send({ t: "progress", done: ++done, total: ids.length, label: m.subject, note: `${r.summary}(${(r.ms / 1000).toFixed(1)} 秒)` });
      } catch (e) {
        // このメールに限った失敗(応答の形がおかしいなど)は記録して次へ。AI サーバに届かないなどの失敗は、残りも同じなので止める
        if (!(e instanceof AiError) || !e.perMessage || single) throw e;
        recordFailure(m.id, kind, e.message);
        send({ t: "progress", done: ++done, total: ids.length, label: m.subject, note: `読み飛ばし: ${e.message}` });
      }
    }
    send({ t: "done", ms: Date.now() - started });
  });
}
