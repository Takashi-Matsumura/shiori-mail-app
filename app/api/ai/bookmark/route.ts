import { isAuthenticated } from "@/lib/auth/session";
import { getAccount } from "@/lib/accounts";
import { chatStream } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { saveAiResult } from "@/lib/ai/ops";
import { BOOKMARK_NOTE_MAX, bookmarkNotePrompt, bookmarkRecapPrompt } from "@/lib/ai/prompts";
import { isSameOrigin, ndjsonResponse } from "@/lib/ai/stream";
import { getDb } from "@/lib/db";
import { getBookmarkThread } from "@/lib/queries";

/** メモを書かせるときに読ませる、挟んだメールまでのやり取りの直近の通数 */
const NOTE_THREAD_LIMIT = 6;
/** あらすじに読ませる、挟んだ後のメールの直近の通数 */
const RECAP_AFTER_LIMIT = 8;

/**
 * 挟んだメール(読みかけ)について栞に書かせる。
 * kind=note: 戻ってきたときのためのメモ。あなたが書き直したメモは上書きしない
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
  const prompt =
    kind === "note"
      ? bookmarkNotePrompt(before.slice(-NOTE_THREAD_LIMIT))
      : bookmarkRecapPrompt({ note: bookmark.note, before: before.slice(-NOTE_THREAD_LIMIT), after: after.slice(-RECAP_AFTER_LIMIT) });

  return ndjsonResponse(async (send) => {
    const started = Date.now();
    let text = "";
    for await (const e of chatStream(getAiConfig(), prompt, { maxTokens: kind === "note" ? 200 : 800 })) {
      if (e.type === "delta") {
        text += e.text;
        send({ t: "delta", v: e.text });
      } else {
        const ms = Date.now() - started;
        if (kind === "note") {
          const note = text.replace(/\s+/g, " ").replace(/^「|」$|。$/g, "").trim().slice(0, BOOKMARK_NOTE_MAX);
          // 書いている間にあなたが書き直したり、外したりしていたら残さない
          getDb()
            .prepare("UPDATE bookmarks SET note = ?, updated = ? WHERE message_id = ? AND note_by = 'ai'")
            .run(note, Date.now(), id);
        } else {
          const upto = Math.max(...after.map((t) => t.id));
          // 書いている間に外していたら残さない
          if (getDb().prepare("SELECT 1 FROM bookmarks WHERE message_id = ?").get(id)) saveAiResult(id, "bookmark_recap", e.model, JSON.stringify({ text: text.trim(), upto }), ms, e.usage);
        }
        send({ t: "done", ms, model: e.model, ...e.usage });
      }
    }
  });
}
