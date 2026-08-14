import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { startBrokerageConnect } from "@/lib/brokerage/sync";

const ConnectSchema = z.object({
  broker: z.string().trim().min(1).max(64).nullable().optional(),
  reconnectId: z.string().trim().min(1).max(64).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    if (resolvePersistenceMode(user) !== "supabase") {
      return jsonError(
        "Brokerage linking requires a live workspace with saved books.",
        503,
      );
    }
    const parsed = ConnectSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return jsonError("Invalid brokerage connect request.", 400);
    }
    const result = await startBrokerageConnect(user, {
      broker: parsed.data.broker?.trim() || null,
      reconnectId: parsed.data.reconnectId ?? null,
    });
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
