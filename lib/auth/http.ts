import "server-only";
import { isSameOrigin } from "@/lib/ai/stream";
import { siteFor, type Site } from "@/lib/auth/site";

/** パスキーの API を受け付けるか。同一オリジンで、localhost か公開ホストから開いているものに限る。 */
export function passkeySite(request: Request): Site | null {
  if (!isSameOrigin(request)) return null;
  return siteFor(request.headers);
}
