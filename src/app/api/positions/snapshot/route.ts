import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { parsePositionRecords } from "@/lib/positions/record";
import { PositionSnapshotSchema } from "@/lib/positions/schemas";
import { buildPositionsSnapshot } from "@/lib/positions/service";
import { resolvePersistenceMode } from "@/lib/positions/store";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const persistence = resolvePersistenceMode(user);
    if (persistence !== "fixtures" && !fixturesEnabled()) {
      return jsonError(
        persistence === "unavailable"
          ? "Position persistence is not connected in this environment."
          : "Session blotter enrichment is only available in demo mode.",
        persistence === "unavailable" ? 503 : 403,
      );
    }
    const parsed = PositionSnapshotSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return jsonError("Invalid snapshot request", 400);
    }
    const positions = parsePositionRecords(
      parsed.data.positions as unknown[],
    );
    const snapshot = await buildPositionsSnapshot({
      user,
      positions,
      includeClosed: parsed.data.includeClosed !== false,
      includeHistory: parsed.data.includeHistory === true,
      ownerId: parsed.data.ownerId,
      bookId: parsed.data.bookId,
      books: parsed.data.books,
      accountValue: parsed.data.accountValue,
    });
    return jsonOk(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}
