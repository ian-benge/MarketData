import {
  handleRouteError,
  jsonOk,
  fixturesEnabled,
  verifyCronSecret,
  jsonError,
} from "@/lib/api/http";
import { getEnv } from "@/lib/env";
import {
  runMarketDataRefresh,
  shouldAttemptRefresh,
} from "@/lib/market-data/refresh-service";
import {
  getUsdCatalystCalendar,
  usdCatalystNeedsMorningRefresh,
} from "@/lib/providers/forex-factory/calendar";
import { enqueueDueReportRuns } from "@/lib/reports/enqueue";
import { resolveStaleInstruments } from "@/lib/watchlists/resolve";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    if (!verifyCronSecret(request)) {
      return jsonError("Unauthorized", 401);
    }

    const env = getEnv();
    const at = new Date().toISOString();

    let marketRefresh: Awaited<ReturnType<typeof runMarketDataRefresh>> | null =
      null;
    if (!fixturesEnabled() && shouldAttemptRefresh()) {
      try {
        marketRefresh = await runMarketDataRefresh({ env, force: false });
      } catch (err) {
        marketRefresh = {
          status: "failed",
          startedAt: at,
          finishedAt: new Date().toISOString(),
          session: "closed",
          cadenceSeconds: env.MARKET_DATA_REFRESH_CLOSED_SECONDS,
          universe: null,
          symbolsRequested: 0,
          symbolsReceived: 0,
          providerName: null,
          feedCoverage: null,
          usedFallback: false,
          healthEvents: [],
          usage: null,
          errorMessage: err instanceof Error ? err.message : String(err),
          skippedReason: null,
          breadth: { supported: false, explanation: null },
          moversCoverageNotes: null,
        };
      }
    }

    let catalystRefresh: "refreshed" | "fresh" | "failed" | "skipped" =
      "skipped";
    if (!fixturesEnabled()) {
      try {
        if (usdCatalystNeedsMorningRefresh()) {
          await getUsdCatalystCalendar({ force: true });
          catalystRefresh = "refreshed";
        } else {
          catalystRefresh = "fresh";
        }
      } catch {
        catalystRefresh = "failed";
      }
    }

    const enqueue = await enqueueDueReportRuns(new Date());
    let instrumentResolve: Awaited<ReturnType<typeof resolveStaleInstruments>> | null =
      null;
    if (!fixturesEnabled()) {
      try {
        instrumentResolve = await resolveStaleInstruments({ limit: 40 });
      } catch {
        instrumentResolve = { scanned: 0, resolved: 0, queued: 0 };
      }
    }

    if (fixturesEnabled()) {
      return jsonOk({
        ok: true,
        mode: "demo",
        considered: enqueue.considered,
        enqueued: enqueue.enqueued,
        skipped: enqueue.skipped,
        notes: enqueue.notes,
        marketRefresh: marketRefresh
          ? {
              status: marketRefresh.status,
              symbolsReceived: marketRefresh.symbolsReceived,
            }
          : { status: "skipped", reason: "fixtures" },
        at,
      });
    }

    return jsonOk({
      ok: true,
      considered: enqueue.considered,
      enqueued: enqueue.enqueued,
      skipped: enqueue.skipped,
      notes: enqueue.notes,
      editions: enqueue.editions,
      catalystRefresh,
      instrumentResolve,
      marketRefresh: marketRefresh
        ? {
            status: marketRefresh.status,
            symbolsRequested: marketRefresh.symbolsRequested,
            symbolsReceived: marketRefresh.symbolsReceived,
            skippedReason: marketRefresh.skippedReason,
            errorMessage: marketRefresh.errorMessage,
            feedCoverage: marketRefresh.feedCoverage,
            session: marketRefresh.session,
          }
        : null,
      at,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
