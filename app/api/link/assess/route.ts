import { createHash } from "node:crypto";
import { AiError, chatJson } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  linkAssessmentPrompt,
  linkAssessmentSchema,
  normalizeLinkAssessment,
  type LinkAssessment,
  type LinkAssessmentResponse,
} from "@/lib/ai/prompts";
import { isSameOrigin } from "@/lib/ai/stream";
import { checkLink, parseLink } from "@/lib/mail/link-check";
import { isValidLinkSignature } from "@/lib/mail/link-sig";

// 同じリンクを開き直すたびに AI を呼ばないよう、見立てをしばらく覚えておく
const CACHE_MAX = 200;
const cache = new Map<string, LinkAssessment>();

/**
 * リンクの確認ページ(/link)に出す、栞の見立て。確認ページと同じくログインなしで呼べる
 * (メールの iframe から開いたタブには、ログインの Cookie が付かないことがある)。
 * その代わり、メールの画面が付けた署名(k)が合うリンクだけを受ける。第三者が作ったリンクで AI を動かさせない。
 * body: { u, t, s, spam, k }(確認ページの URL と同じ値)
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const field = (name: string, max: number) => (typeof body?.[name] === "string" ? (body[name] as string).slice(0, max) : "");
  const sender = field("s", 320);
  const spam = body?.spam === true;
  if (!isValidLinkSignature(sender, spam, field("k", 64))) return new Response("Forbidden", { status: 403 });
  const url = parseLink(field("u", 4000));
  if (!url) return new Response("Bad Request", { status: 400 });
  const text = field("t", 200);

  const key = createHash("sha256").update(JSON.stringify([url.href, text, sender, spam])).digest("hex");
  const cached = cache.get(key);
  if (cached) return Response.json({ assessment: cached } satisfies LinkAssessmentResponse);

  const checks = checkLink({ url, text, sender, spam }).map((w) => `${w.level}: ${w.message}`);
  try {
    const r = await chatJson(getAiConfig(), linkAssessmentPrompt({ url: url.href, text, sender, checks }), "link_assessment", linkAssessmentSchema);
    const assessment = normalizeLinkAssessment(r.value);
    if (!assessment) return Response.json({ assessment: null, error: "栞の答えを読み取れませんでした。" } satisfies LinkAssessmentResponse);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, assessment);
    return Response.json({ assessment } satisfies LinkAssessmentResponse);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    // ログインなしで呼べる API なので、AI サーバの URL などを含む詳しい理由は返さない
    return Response.json({ assessment: null, error: "栞に聞けませんでした(AI サーバに接続できないか、応答がありません)。" } satisfies LinkAssessmentResponse);
  }
}
