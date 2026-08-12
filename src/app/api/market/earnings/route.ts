import {
  handleRouteError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getEarningsCalendarSnapshot } from "@/lib/market-data/earnings/service";

export async function GET() {
  try {
    await requirePermission("viewDashboard");
    const snapshot = await getEarningsCalendarSnapshot(getEnv());
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
