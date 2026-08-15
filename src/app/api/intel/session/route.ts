import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getSessionBrief, rulesOnlyFromRequest } from "@/lib/desk-intel/service";
import { rateLimit } from "@/lib/desk-intel/rate-limit";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";
    const limited = rateLimit({
      key: `session:${user.id}`,
      limit: refresh ? 6 : 30,
    });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const envelope = await getSessionBrief(user, {
      env: getEnv(),
      forceRefresh: refresh,
      rulesOnly: !refresh && rulesOnlyFromRequest(request),
    });
    return jsonOk(envelope, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  try {
    const user = await requirePermission("viewDashboard");
    const limited = rateLimit({ key: `session:${user.id}`, limit: 6 });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const envelope = await getSessionBrief(user, {
      env: getEnv(),
      forceRefresh: true,
    });
    return jsonOk(envelope, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
