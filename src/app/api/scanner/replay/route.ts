import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { replayScannerAt } from "@/lib/scanner/service";
import type { ScannerSystem } from "@/lib/scanner/types";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const at = url.searchParams.get("at");
    if (!at) return jsonError("at is required", 400);
    const system = (url.searchParams.get("system") === "desk" ? "desk" : "momentum") as ScannerSystem;
    const snapshot = await replayScannerAt({ user, at, system });
    if (!snapshot) return jsonError("No scanner history at that timestamp.", 404);
    return jsonOk({ snapshot, replay: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
