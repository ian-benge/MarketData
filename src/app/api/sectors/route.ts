import { nanoid } from "nanoid";
import {
  fixturesEnabled,
  handleRouteError,
  jsonError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { fixtureSectorRecords } from "@/lib/fixtures/watchlists";
import { SectorWriteSchema } from "@/lib/watchlists/schemas";
import { buildCoverageSnapshot } from "@/lib/watchlists/service";
import {
  buildSessionSector,
  createStoredSector,
  listStoredSectors,
  resolvePersistenceMode,
} from "@/lib/watchlists/store";

export async function GET() {
  try {
    const user = await requirePermission("viewDashboard");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "fixtures" || fixturesEnabled()) {
      return jsonOk({ sectors: fixtureSectorRecords() });
    }
    if (persistence === "unavailable") {
      return jsonOk({ sectors: [] });
    }
    const { sectors } = await listStoredSectors(user);
    return jsonOk({ sectors });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("editSectors");
    const persistence = resolvePersistenceMode(user);
    if (persistence === "unavailable") {
      return jsonError(
        "Watchlist persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = SectorWriteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);
    if (persistence === "fixtures") {
      const sector = buildSessionSector(user, parsed.data, {
        id: `sec-${nanoid(10)}`,
      });
      return jsonOk({ sector, demo: true });
    }
    const sector = await createStoredSector(user, parsed.data);
    const snapshot = await buildCoverageSnapshot({
      user,
      selection: { type: "sector", id: sector.id },
    });
    return jsonOk({ sector, snapshot, demo: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
