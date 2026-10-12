import { getActiveAccount } from "@/lib/accounts";
import { chatStream } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { draftPrompt, TONES } from "@/lib/ai/prompts";
import { isSameOrigin, ndjsonResponse } from "@/lib/ai/stream";
import { getMessageById } from "@/lib/queries";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as { replyTo?: unknown; instruction?: unknown; tone?: unknown } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.slice(0, 1000) : "";
  const tone = TONES.find((t) => t === body?.tone) ?? TONES[0];

  const account = getActiveAccount();
  const replyTo = Number(body?.replyTo);
  const original = Number.isInteger(replyTo) ? await getMessageById(account.id, replyTo) : null;
  if (!original && !instruction.trim()) return new Response("Bad Request", { status: 400 });

  const prompt = draftPrompt({ original: original ?? undefined, instruction, tone, senderName: account.name });
  // 下書きは保存しない。作成画面に流し込むだけで、送信は利用者が自分で行う。
  return ndjsonResponse(async (send) => {
    const started = Date.now();
    for await (const e of chatStream(getAiConfig(), prompt, { temperature: 0.5 })) {
      if (e.type === "delta") send({ t: "delta", v: e.text });
      else send({ t: "done", ms: Date.now() - started, model: e.model, ...e.usage });
    }
  });
}
