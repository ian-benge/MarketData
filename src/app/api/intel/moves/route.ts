import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getMoveNarratives } from "@/lib/desk-intel/service";
import { rateLimit } from "@/lib/desk-intel/rate-limit";

export const maxDuration = 60;

const BodySchema = z.object({
  tickers: z.array(z.string().min(1)).min(1).max(8),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const limited = rateLimit({ key: `moves:${user.id}`, limit: 20 });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const body = BodySchema.parse(await request.json());
    const narratives = await getMoveNarratives(user, body.tickers, {
      env: getEnv(),
    });
    return jsonOk({ narratives });
  } catch (error) {
    return handleRouteError(error);
  }
}
