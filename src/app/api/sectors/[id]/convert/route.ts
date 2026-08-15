import { nanoid } from "nanoid";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { hasPermission } from "@/lib/domain/permissions";
import { SectorConvertSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  buildSessionWatchlist,
  convertStoredSectorToWatchlist,
  resolvePersistenceMode,
} from "@/lib/watchlists/store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requirePermission("editSectors");
    if (!hasPermission(user.role, "editWatchlists")) {
      return jsonError("Missing permission: editWatchlists", 403);
    }
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    const parsed = SectorConvertSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (persistence === "fixtures") {
      const watchlist = buildSessionWatchlist(
        user,
        {
          name: parsed.data.name ?? "Watchlist",
          description: parsed.data.description,
          visibility: parsed.data.visibility ?? "shared",
          isDefault: parsed.data.isDefault === true,
          symbols: parsed.data.symbols ?? [],
        },
        { id: `wl-${nanoid(10)}` },
      );
      return jsonOk({ watchlist, demo: true });
    }
    const watchlist = await convertStoredSectorToWatchlist(user, id, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "watchlist", id: watchlist.id },
    });
    return jsonOk({ watchlist, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
