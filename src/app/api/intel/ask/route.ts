import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { askDesk } from "@/lib/desk-intel/service";
import { rateLimit } from "@/lib/desk-intel/rate-limit";
import { sanitizeQuestion } from "@/lib/desk-intel/sanitize";

export const maxDuration = 60;

const BodySchema = z.object({
  question: z.string().min(3).max(500),
  rulesOnly: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const limited = rateLimit({ key: `ask:${user.id}`, limit: 20 });
    if (!limited.ok) {
      return jsonError("Too many intelligence requests", 429, {
        retryAfterSec: limited.retryAfterSec,
      });
    }
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError("Question must be 3–500 characters", 400);
    }
    const envelope = await askDesk(user, sanitizeQuestion(parsed.data.question), {
      env: getEnv(),
      rulesOnly: parsed.data.rulesOnly === true,
    });
    return jsonOk(envelope);
  } catch (error) {
    return handleRouteError(error);
  }
}
