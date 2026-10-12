import "server-only";
import { AiError } from "@/lib/ai/client";

export type StreamEvent =
  | { t: "delta"; v: string }
  | { t: "progress"; done: number; total: number; label: string; note: string }
  | { t: "done"; ms: number; model?: string; promptTokens?: number | null; completionTokens?: number | null }
  | { t: "error"; message: string };

/** 他サイトのページからこの API を叩かれないよう、同一オリジンのリクエストだけを通す。 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

/** 進行状況を 1 行 1 JSON(NDJSON)で流すレスポンスを作る。 */
export function ndjsonResponse(run: (send: (e: StreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await run(send);
      } catch (e) {
        if (!(e instanceof AiError)) console.error(e);
        send({ t: "error", message: e instanceof AiError ? e.message : "処理中にエラーが発生しました。" });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
