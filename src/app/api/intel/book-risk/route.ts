import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getBookRisk, rulesOnlyFromRequest } from "@/lib/desk-intel/service";
import { rateLimit } from "@/lib/desk-intel/rate-limit";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const limited = rateLimit({ key: `book:${user.id}`, limit: 20 });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const envelope = await getBookRisk(user, {
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
