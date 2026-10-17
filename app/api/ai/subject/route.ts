import { isAuthenticated } from "@/lib/auth/session";
import { AiError, chatJson } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { normalizeSubjects, subjectPrompt, subjectSchema, type SubjectResponse } from "@/lib/ai/prompts";
import { isSameOrigin } from "@/lib/ai/stream";

/** 新規作成の件名の候補。結果は画面に出すだけで、選ぶかどうかは利用者が決める(保存もしない)。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const field = (name: string, max: number) => (typeof body?.[name] === "string" ? (body[name] as string).slice(0, max) : "");
  const text = field("text", 20_000);
  if (!text.trim()) return new Response("Bad Request", { status: 400 });
  try {
    const r = await chatJson(getAiConfig(), subjectPrompt({ to: field("to", 1000), text }), "mail_subject", subjectSchema);
    return Response.json({ subjects: normalizeSubjects(r.value) } satisfies SubjectResponse);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return Response.json({ subjects: [], error: e.message } satisfies SubjectResponse);
  }
}
