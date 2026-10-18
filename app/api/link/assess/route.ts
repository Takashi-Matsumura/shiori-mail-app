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
import { checkLink, parseLink, type LinkWarning } from "@/lib/mail/link-check";
import { isValidLinkSignature } from "@/lib/mail/link-sig";
import { parseSenderAuth } from "@/lib/mail/sender-auth";

// 同じリンクを開き直すたびに AI を呼ばないよう、見立てをしばらく覚えておく
const CACHE_MAX = 200;
const cache = new Map<string, LinkAssessment>();
// AI を呼ぶのは 1 分あたりこの回数まで(覚えていた見立てを返すときは数えない)。署名の鍵が漏れても AI を際限なく動かさせない
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const calls: number[] = [];

function allowCall(now = Date.now()): boolean {
  while (calls.length > 0 && now - calls[0] > RATE_WINDOW_MS) calls.shift();
  if (calls.length >= RATE_LIMIT) return false;
  calls.push(now);
  return true;
}

/**
 * 栞の見立てが、機械的な手がかりより安心させる表示にならないようにする。URL や表示の文字は送り手が書けるので、
 * そこに AI 向けの指示を混ぜて「特に気になる点なし」と答えさせられても、危険・注意の手がかりがあるときは「気になる点あり」に引き上げる
 */
function clampToChecks(assessment: LinkAssessment, levels: LinkWarning["level"][]): LinkAssessment {
  if (assessment.verdict !== "特に気になる点なし" || !levels.some((l) => l === "危険" || l === "注意")) return assessment;
  return { verdict: "気になる点あり", reason: "上の警告(機械的な手がかり)があるので、行き先を確かめてから開いてください。" };
}

/**
 * リンクの確認ページ(/link)に出す、栞の見立て。確認ページと同じくログインなしで呼べる
 * (メールの iframe から開いたタブには、ログインの Cookie が付かないことがある)。
 * その代わり、メールの画面が付けた署名(k)が合うリンクだけを受ける。第三者が作ったリンクで AI を動かさせない。
 * body: { u, t, s, spam, a, k }(確認ページの URL と同じ値)
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const field = (name: string, max: number) => (typeof body?.[name] === "string" ? (body[name] as string).slice(0, max) : "");
  const sender = field("s", 320);
  const spam = body?.spam === true;
  const auth = parseSenderAuth(body?.a);
  if (!isValidLinkSignature({ sender, spam, auth }, field("k", 64))) return new Response("Forbidden", { status: 403 });
  const url = parseLink(field("u", 4000));
  if (!url) return new Response("Bad Request", { status: 400 });
  const text = field("t", 200);

  const key = createHash("sha256").update(JSON.stringify([url.href, text, sender, spam, auth])).digest("hex");
  const cached = cache.get(key);
  if (cached) return Response.json({ assessment: cached } satisfies LinkAssessmentResponse);

  if (!allowCall()) {
    return Response.json({ assessment: null, error: "栞への問い合わせが続いています。少し待ってから開き直してください。" } satisfies LinkAssessmentResponse);
  }
  const warnings = checkLink({ url, text, sender, spam, senderAuth: auth });
  const checks = warnings.map((w) => `${w.level}: ${w.message}`);
  try {
    const r = await chatJson(getAiConfig(), linkAssessmentPrompt({ url: url.href, text, sender, checks }), "link_assessment", linkAssessmentSchema);
    const normalized = normalizeLinkAssessment(r.value);
    if (!normalized) return Response.json({ assessment: null, error: "栞の答えを読み取れませんでした。" } satisfies LinkAssessmentResponse);
    const assessment = clampToChecks(normalized, warnings.map((w) => w.level));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, assessment);
    return Response.json({ assessment } satisfies LinkAssessmentResponse);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    // ログインなしで呼べる API なので、AI サーバの URL などを含む詳しい理由は返さない
    return Response.json({ assessment: null, error: "栞に聞けませんでした(AI サーバに接続できないか、応答がありません)。" } satisfies LinkAssessmentResponse);
  }
}
