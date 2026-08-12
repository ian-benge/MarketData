import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { getEnv } from "@/lib/env";
import { getEarningsHistorySnapshot } from "@/lib/market-data/earnings/history-service";

export async function GET(request: Request) {
  try {
    await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol")?.trim() ?? "";
    if (!symbol) {
      return jsonError("symbol is required", 400);
    }
    const snapshot = await getEarningsHistorySnapshot(getEnv(), symbol, {
      companyName: url.searchParams.get("name"),
    });
    return jsonOk(snapshot, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
