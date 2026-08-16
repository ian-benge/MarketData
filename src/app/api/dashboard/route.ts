import { handleRouteError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { loadDashboardSnapshot } from "@/lib/dashboard/snapshot";

export async function GET(request?: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = request ? new URL(request.url) : null;
    const live = url?.searchParams.get("live") === "1";
    const listId = url?.searchParams.get("listId");
    const sectorId = url?.searchParams.get("sectorId");
    const payload = await loadDashboardSnapshot({
      user,
      live,
      listId,
      sectorId,
    });
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
