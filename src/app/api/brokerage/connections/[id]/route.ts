import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { disconnectBrokerage, startBrokerageConnect } from "@/lib/brokerage/sync";

const ReconnectSchema = z.object({
  action: z.literal("reconnect"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("editPositions");
    const { id } = await context.params;
    if (!id) return jsonError("Connection id required.", 400);
    if (resolvePersistenceMode(user) !== "supabase") {
      return jsonError(
        "Brokerage linking requires a live workspace with saved books.",
        503,
      );
    }
    const parsed = ReconnectSchema.safeParse(
      await request.json().catch(() => ({ action: "reconnect" })),
    );
    if (!parsed.success) {
      return jsonError("Invalid reconnect request.", 400);
    }
    const result = await startBrokerageConnect(user, { reconnectId: id });
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("editPositions");
    const { id } = await context.params;
    if (!id) return jsonError("Connection id required.", 400);
    if (resolvePersistenceMode(user) !== "supabase") {
      return jsonError(
        "Brokerage linking requires a live workspace with saved books.",
        503,
      );
    }
    await disconnectBrokerage(user, id);
    const bookId = new URL(request.url).searchParams.get("book");
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId: user.id,
      bookId,
    });
    return jsonOk({ ok: true, snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
