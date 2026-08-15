import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { SectorPatchSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  deleteStoredSector,
  resolvePersistenceMode,
  updateStoredSector,
} from "@/lib/watchlists/store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requirePermission("editSectors");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    const parsed = SectorPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({ sector: { id, ...parsed.data }, demo: true });
    }
    const sector = await updateStoredSector(user, id, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "sector", id: sector.id },
    });
    return jsonOk({ sector, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requirePermission("editSectors");
    if (resolvePersistenceMode(user) === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const { id } = await context.params;
    if (resolvePersistenceMode(user) === "fixtures") {
      return jsonOk({ id, demo: true });
    }
    await deleteStoredSector(user, id);
    const snapshot = await buildCoverageSnapshot({ user });
    return jsonOk({ id, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
