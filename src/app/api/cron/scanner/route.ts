import { handleRouteError, jsonError, jsonOk, verifyCronSecret } from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import { runScannerTick } from "@/lib/scanner/engine";
import { isScannerMonitorWindow } from "@/lib/scanner/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    if (!verifyCronSecret(request)) {
      return jsonError("Unauthorized", 401);
    }
    const now = new Date();
    const force = new URL(request.url).searchParams.get("force") === "1";
    if (!force && !isScannerMonitorWindow(now)) {
      return jsonOk({
        ok: true,
        skipped: "outside_monitor_window",
        at: now.toISOString(),
      });
    }
    const tick = await runScannerTick({ env: getEnv(), force, now });
    return jsonOk({
      ok: true,
      skipped: tick.skippedReason,
      asOf: tick.snapshot.asOf,
      session: tick.snapshot.session,
      symbolsReceived: tick.snapshot.coverage.symbolsReceived,
      alerts: tick.snapshot.alerts.length,
      freshness: tick.snapshot.coverage.freshness,
      at: now.toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
