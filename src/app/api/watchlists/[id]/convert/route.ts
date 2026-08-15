import { nanoid } from "nanoid";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { hasPermission } from "@/lib/domain/permissions";
import { WatchlistConvertSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  buildSessionSector,
  convertStoredWatchlistToSector,
  resolvePersistenceMode,
} from "@/lib/watchlists/store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requirePermission("editWatchlists");
    if (!hasPermission(user.role, "editSectors")) {
      return jsonError("Missing permission: editSectors", 403);
    }
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    const parsed = WatchlistConvertSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (persistence === "fixtures") {
      const sector = buildSessionSector(
        user,
        {
          name: parsed.data.name ?? "Theme",
          description: parsed.data.description,
          kind: parsed.data.kind ?? "theme",
          symbols: parsed.data.symbols ?? [],
        },
        { id: `sec-${nanoid(10)}` },
      );
      return jsonOk({ sector, demo: true });
    }
    const sector = await convertStoredWatchlistToSector(user, id, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "sector", id: sector.id },
    });
    return jsonOk({ sector, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
