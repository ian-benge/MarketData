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

    const jobs = await advanceActiveReportRuns(new Date());

    return jsonOk({
      ok: true,
      mode: fixturesEnabled() ? "demo" : "live",
      continued: jobs.continued,
      completed: jobs.completed,
      failed: jobs.failed,
      heldForPublish: jobs.heldForPublish,
      notes: jobs.notes,
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
