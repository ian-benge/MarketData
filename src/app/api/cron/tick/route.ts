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
import { getIntelligenceBundle, quotesFromMarketCache } from "@/lib/intelligence/service";
import { generateBookRisk, generateSessionBrief } from "@/lib/desk-intel/generate";
import { buildEvidencePack } from "@/lib/desk-intel/evidence";
import { selectDeskCalendar } from "@/lib/desk-intel/context";
import { scheduleUnexplainedBookAlerts } from "@/lib/desk-intel/book-alerts";
import { saveBrief } from "@/lib/desk-intel/store";
import { loadDashboardCatalystCalendar } from "@/lib/market-data/catalyst-calendar-load";
import { loadOpenPositionTickers } from "@/lib/positions/store";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
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

    let newsRefresh: "refreshed" | "failed" | "skipped" | "persist_failed" =
      "skipped";
    let newsPersistNote: string | null = null;
    let deskBrief: "refreshed" | "failed" | "skipped" = "skipped";
    if (!fixturesEnabled()) {
      try {
        const bundle = await getIntelligenceBundle(env, { force: true });
        const persistGap = bundle.gaps.find(
          (gap) =>
            gap.code === "persist_error" || gap.code === "news_store_unconfigured",
        );
        newsPersistNote = persistGap?.message ?? null;
        newsRefresh = persistGap ? "persist_failed" : "refreshed";
        try {
          const [calendar, inBookTickers] = await Promise.all([
            loadDashboardCatalystCalendar(env).catch(() => []),
            loadOpenPositionTickers(env.FIRM_ID).catch(() => []),
          ]);
          const pack = buildEvidencePack({
            bundle,
            quotes: quotesFromMarketCache(),
            inBookTickers,
            calendar: selectDeskCalendar(calendar),
            session: bundle.moves[0]?.session ?? null,
          });
          const envelope = await generateSessionBrief(pack, { env });
          const firmId = env.FIRM_ID ?? DEFAULT_FIRM_UUID;
          await saveBrief(firmId, envelope, null);
          const risk = await generateBookRisk(pack, { env });
          await saveBrief(firmId, risk, null);
          scheduleUnexplainedBookAlerts({ firmId, pack, risk: risk.data });
          deskBrief = "refreshed";
        } catch {
          deskBrief = "failed";
        }
      } catch {
        newsRefresh = "failed";
      }
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
      newsRefresh,
      newsPersistNote,
      deskBrief,
      instrumentResolve,
      scannerTick,
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
