import { getActiveAccount } from "@/lib/accounts";
import { chatStream } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { saveAiResult } from "@/lib/ai/ops";
import { summarizePrompt, threadSummaryPrompt } from "@/lib/ai/prompts";
import { isSameOrigin, ndjsonResponse } from "@/lib/ai/stream";
import { getMessageById, getThread } from "@/lib/queries";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; scope?: unknown } | null;
  const id = Number(body?.id);
  const scope = body?.scope === "thread" ? "thread" : "message";
  if (!Number.isInteger(id)) return new Response("Bad Request", { status: 400 });

  const account = getActiveAccount();
  const message = await getMessageById(account.id, id);
  if (!message) return new Response("Not Found", { status: 404 });
  const prompt =
    scope === "thread"
      ? threadSummaryPrompt(await getThread(account.id, message.thread_key))
      : summarizePrompt(message);

  return ndjsonResponse(async (send) => {
    const started = Date.now();
    let text = "";
    for await (const e of chatStream(getAiConfig(), prompt, { maxTokens: 1200 })) {
      if (e.type === "delta") {
        text += e.text;
        send({ t: "delta", v: e.text });
      } else {
        const ms = Date.now() - started;
        saveAiResult(id, scope === "thread" ? "thread_summary" : "summary", e.model, text.trim(), ms, e.usage);
        send({ t: "done", ms, model: e.model, ...e.usage });
      }
    }
  });
}
