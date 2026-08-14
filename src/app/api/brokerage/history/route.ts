import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { resolvePersistenceMode } from "@/lib/positions/store";
import { importBrokerageHistory, loadBrokerageSnapshot } from "@/lib/brokerage/sync";
import { HISTORY_LOOKBACKS } from "@/lib/brokerage/history-lookback";

export const maxDuration = 60;

const HistoryImportSchema = z.object({
  lookback: z.enum(HISTORY_LOOKBACKS).default("all"),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editPositions");
    if (resolvePersistenceMode(user) !== "supabase") {
      return jsonError(
        "Importing past trades requires a live workspace with saved books.",
        503,
      );
    }
    const url = new URL(request.url);
    const ownerId = url.searchParams.get("owner") ?? user.id;
    if (ownerId !== user.id) {
      return jsonError("You can only import history for your own brokerage accounts.", 403);
    }
    const bookId = url.searchParams.get("book");
    const parsed = HistoryImportSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return jsonError("Choose 1 day, 1 week, 1 month, or all history.", 400);
    }
    const result = await importBrokerageHistory(user, parsed.data.lookback);
    const snapshot = await buildPositionsSnapshot({
      user,
      includeClosed: true,
      ownerId: user.id,
      bookId,
    });
    return jsonOk({
      ...result,
      brokerage: await loadBrokerageSnapshot(user, user.id),
      snapshot,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
