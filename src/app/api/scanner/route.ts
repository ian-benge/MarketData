import { handleRouteError, jsonError, jsonOk } from "@/lib/api/http";
import { requirePermission } from "@/lib/auth/authorize";
import { SCANNER_STRATEGIES } from "@/lib/scanner/strategies";
import { getScannerPayload, parseScannerFilters } from "@/lib/scanner/service";
import type { ScannerSystem } from "@/lib/scanner/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("viewDashboard");
    const url = new URL(request.url);
    const system = (url.searchParams.get("system") === "desk" ? "desk" : "momentum") as ScannerSystem;
    const refresh = url.searchParams.get("refresh") === "1";
    const strategies = url.searchParams.get("strategies");
    const payload = await getScannerPayload({
      user,
      system,
      filters: parseScannerFilters(url.searchParams),
      strategyIds: strategies ? strategies.split(",").filter(Boolean) : undefined,
      refresh,
    });
    return jsonOk({
      ...payload,
      catalog: SCANNER_STRATEGIES.filter((item) => item.system === system).map((item) => ({
        id: item.id,
        title: item.title,
        shortTitle: item.shortTitle,
        description: item.description,
        kind: item.kind,
        system: item.system,
      })),
      pollSeconds: payload.snapshot.coverage.cadenceSeconds,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("viewDashboard");
    return jsonError("Use GET for scanner snapshots.", 405);
  } catch (error) {
    return handleRouteError(error);
  }
}
