import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMoveNarrative, rulesOnlyFromRequest } from "@/lib/desk-intel/service";
import { rateLimit } from "@/lib/desk-intel/rate-limit";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return jsonError("ticker is required", 400);
    const limited = rateLimit({ key: `move:${user.id}`, limit: 40 });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const envelope = await getMoveNarrative(user, ticker, {
      env: getEnv(),
      rulesOnly: rulesOnlyFromRequest(request),
    });
    return jsonOk(envelope, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
