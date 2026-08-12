import {
  handleRouteError,
  jsonOk,
} from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getFedWatchSnapshot } from "@/lib/market-data/fedwatch/service";

export async function GET() {
  try {
    await requirePermission("viewDashboard");
    const snapshot = await getFedWatchSnapshot(getEnv());
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
