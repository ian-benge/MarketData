import { handleRouteError, jsonOk, fixturesEnabled } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { fixtureSectors } from "@/lib/fixtures/watchlists";

export async function GET() {
  try {
    await requirePermission("viewDashboard");
    if (fixturesEnabled()) {
      return jsonOk({ sectors: fixtureSectors });
    }
    return jsonOk({ sectors: [] });
  } catch (error) {
    return handleRouteError(error);
  }
}
