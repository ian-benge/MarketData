import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
  verifyCronSecret,
} from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import {
  runMarketDataRefresh,
  shouldAttemptRefresh,
} from "@/lib/market-data/refresh-service";
import { advanceActiveReportRuns } from "@/lib/reports/enqueue";
import { runScannerTick } from "@/lib/scanner/engine";
import { isScannerMonitorWindow } from "@/lib/scanner/session";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    if (!verifyCronSecret(request)) {
      return jsonError("Unauthorized", 401);
    }

    const env = getEnv();
    let marketRefresh: Awaited<ReturnType<typeof runMarketDataRefresh>> | null =
      null;
    if (!fixturesEnabled() && shouldAttemptRefresh()) {
      marketRefresh = await runMarketDataRefresh({ env, force: false });
    }

    let scannerTick: { skipped: string | null; symbolsReceived?: number } | null =
      null;
    if (!fixturesEnabled() && isScannerMonitorWindow(new Date())) {
      try {
        const tick = await runScannerTick({ env, force: false });
        scannerTick = {
          skipped: tick.skippedReason,
          symbolsReceived: tick.snapshot.coverage.symbolsReceived,
        };
      } catch {
        scannerTick = { skipped: "failed" };
      }
    }

    const jobs = await advanceActiveReportRuns(new Date());

    return jsonOk({
      ok: true,
      mode: fixturesEnabled() ? "demo" : "live",
      continued: jobs.continued,
      completed: jobs.completed,
      failed: jobs.failed,
      heldForPublish: jobs.heldForPublish,
      notes: jobs.notes,
      scannerTick,
      marketRefresh: marketRefresh
        ? {
            status: marketRefresh.status,
            symbolsReceived: marketRefresh.symbolsReceived,
            skippedReason: marketRefresh.skippedReason,
            errorMessage: marketRefresh.errorMessage,
          }
        : fixturesEnabled()
          ? { status: "skipped", reason: "fixtures" }
          : null,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
