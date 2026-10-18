import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { AiError, chatJson, chatStream } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { saveAiResult } from "@/lib/ai/ops";
import { bookmarkNotePrompt, bookmarkNoteSchema, bookmarkRecapPrompt, dropNameTags, normalizeBookmarkNote, normalizeTags, parseTags } from "@/lib/ai/prompts";
import { isSameOrigin, ndjsonResponse } from "@/lib/ai/stream";
import { getDb } from "@/lib/db";
import { getBookmarkThread } from "@/lib/queries";

/** メモを書かせるときに読ませる、挟んだメールまでのやり取りの直近の通数 */
const NOTE_THREAD_LIMIT = 6;
/** あらすじに読ませる、挟んだ後のメールの直近の通数 */
const RECAP_AFTER_LIMIT = 8;

/**
 * 挟んだメール(読みかけ)について栞に書かせる。
 * kind=note: 戻ってきたときのためのメモとキーワード。あなたが書き直したメモは上書きせず、キーワードは今あるものに足す
 * kind=recap: 挟んでから届いた・送ったメールのあらすじ。どこまで読ませたか(upto)も一緒に残す
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; kind?: unknown } | null;
  const id = Number(body?.id);
  const kind = body?.kind === "recap" ? "recap" : "note";
  if (!Number.isInteger(id)) return new Response("Bad Request", { status: 400 });

  const account = getAccount();
  if (!account) return new Response("アカウントが未設定です", { status: 409 });
  const found = getBookmarkThread(account.id, id);
  if (!found) return new Response("Not Found", { status: 404 });
  const { bookmark, before, after } = found;
  if (kind === "recap" && after.length === 0) return new Response("挟んだ後のメールはまだありません", { status: 409 });

  if (kind === "note") {
    return ndjsonResponse(async (send) => {
      const thread = before.slice(-NOTE_THREAD_LIMIT);
      const r = await chatJson(getAiConfig(), bookmarkNotePrompt(thread), "bookmark_note", bookmarkNoteSchema);
      const value = normalizeBookmarkNote(r.value);
      if (!value) throw new AiError("メモが想定した形ではありませんでした。");
      const db = getDb();
      // 書いている間にあなたが書き直したメモ・足したキーワードは残す。外していたら何も残らない
      db.prepare("UPDATE bookmarks SET note = ?, updated = ? WHERE message_id = ? AND note_by = 'ai'").run(value.note, Date.now(), id);
      const current = db.prepare("SELECT tags FROM bookmarks WHERE message_id = ?").get(id) as { tags: string } | undefined;
      if (current) {
        db.prepare("UPDATE bookmarks SET tags = ? WHERE message_id = ?").run(JSON.stringify(normalizeTags([...parseTags(current.tags), ...dropNameTags(value.tags, thread)])), id);
      }
      send({ t: "done", ms: r.ms, model: r.model, ...r.usage });
    });
  }

  const prompt = bookmarkRecapPrompt({ note: bookmark.note, before: before.slice(-NOTE_THREAD_LIMIT), after: after.slice(-RECAP_AFTER_LIMIT) });
  return ndjsonResponse(async (send) => {
    const started = Date.now();
    let text = "";
    for await (const e of chatStream(getAiConfig(), prompt, { maxTokens: 800 })) {
      if (e.type === "delta") {
        text += e.text;
        send({ t: "delta", v: e.text });
      } else {
        const ms = Date.now() - started;
        const upto = Math.max(...after.map((t) => t.id));
        // 書いている間に外していたら残さない
        if (getDb().prepare("SELECT 1 FROM bookmarks WHERE message_id = ?").get(id)) {
          saveAiResult(id, "bookmark_recap", e.model, JSON.stringify({ text: text.trim(), upto }), ms, e.usage);
        }
        send({ t: "done", ms, model: e.model, ...e.usage });
      }
    }
  });
}
