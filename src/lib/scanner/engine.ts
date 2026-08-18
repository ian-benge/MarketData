import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import { DEFAULT_FIRM_UUID } from "@/lib/reports/editions";
import { evaluateScan } from "./evaluate";
import { ingestScannerUniverse, resolveScannerFirmId } from "./ingest";
import { fixtureScannerSnapshot } from "./fixtures";
import {
  loadPriorAlertStates,
  loadTickerProfiles,
  persistScannerTick,
} from "./store";
import { inferSessionPreset, readScannerClock, scannerCadenceSeconds } from "./session";
import type {
  DataFreshnessState,
  ScannerCenterSnapshot,
  ScannerCoverageMeta,
  ScannerSystem,
} from "./types";
import { listsForSystem } from "./evaluate";

class ProcessMutex {
  private active = false;
  private owner: string | null = null;

  async runExclusive<T>(
    ownerId: string,
    fn: () => Promise<T>,
  ): Promise<{ ran: boolean; result?: T; skippedReason?: string }> {
    if (this.active) {
      return { ran: false, skippedReason: `overlap: ${this.owner ?? "unknown"}` };
    }
    this.active = true;
    this.owner = ownerId;
    try {
      return { ran: true, result: await fn() };
    } finally {
      this.active = false;
      this.owner = null;
    }
  }
}

const mutex = new ProcessMutex();

let memory: { snapshot: ScannerCenterSnapshot; atMs: number } | null = null;

export function getScannerMemory(): ScannerCenterSnapshot | null {
  return memory?.snapshot ?? null;
}

export function resetScannerMemory() {
  memory = null;
}

function freshnessOf(
  latency: ScannerCoverageMeta["latencyClass"],
  mocked: boolean,
  stale: boolean,
  partial: boolean,
): DataFreshnessState {
  if (mocked) return "mock";
  if (stale) return "stale";
  if (partial) return "partial";
  if (latency === "unavailable") return "unavailable";
  if (latency === "delayed_15m" || latency === "eod") return "delayed";
  return "live";
}

export async function runScannerTick(options: {
  env?: Env;
  force?: boolean;
  now?: Date;
} = {}): Promise<{
  snapshot: ScannerCenterSnapshot;
  skippedReason: string | null;
}> {
  const env = options.env ?? getEnv();
  const now = options.now ?? new Date();
  if (fixturesEnabled()) {
    const snapshot = fixtureScannerSnapshot(now);
    memory = { snapshot, atMs: now.getTime() };
    return { snapshot, skippedReason: null };
  }

  const exclusive = await mutex.runExclusive("scanner", async () => {
    const clock = readScannerClock(now);
    const cadence = scannerCadenceSeconds(clock.session, env);
    if (!options.force && memory && now.getTime() - memory.atMs < cadence * 1000) {
      return { snapshot: memory.snapshot, skippedReason: "cadence" as const };
    }

    const firmId = resolveScannerFirmId(env);
    const prior = await loadPriorAlertStates(firmId, clock.sessionDate);
    const profiles = await loadTickerProfiles(firmId);
    const ingested = await ingestScannerUniverse({
      env,
      clock,
      firmId,
      priorAlertSymbols: prior.map((row) => row.ticker),
      historyByTicker: profiles,
    });

    const evaluated = evaluateScan({
      features: ingested.features,
      now,
      sessionDate: clock.sessionDate,
      priorAlerts: prior,
      listLimit: env.SCANNER_LIST_LIMIT,
    });

    const coverage: ScannerCoverageMeta = {
      freshness: freshnessOf(
        ingested.latencyClass,
        false,
        ingested.features.some((row) => row.stale),
        ingested.symbolsReceived < ingested.symbolsRequested.length,
      ),
      providerName: ingested.providerName,
      feedCoverage: ingested.feedCoverage,
      latencyClass: ingested.latencyClass,
      cadenceSeconds: cadence,
      lastUpdate: now.toISOString(),
      nextUpdate: new Date(now.getTime() + cadence * 1000).toISOString(),
      symbolsRequested: ingested.symbolsRequested.length,
      symbolsReceived: ingested.symbolsReceived,
      universeLimited: !ingested.entitlements.fullMarket,
      coverageNotes: ingested.notes,
      entitlements: ingested.entitlements,
    };

    const snapshot: ScannerCenterSnapshot = {
      asOf: now.toISOString(),
      session: clock.session,
      sessionDate: clock.sessionDate,
      sessionPreset: inferSessionPreset(now),
      system: "momentum",
      lists: evaluated.lists,
      alerts: evaluated.alerts,
      selectedTicker: null,
      features: Object.fromEntries(ingested.features.map((row) => [row.ticker, row])),
      coverage,
      runId: null,
      mocked: false,
    };

    const persisted = await persistScannerTick({
      firmId,
      snapshot,
      evaluated,
      clock,
      cadenceSeconds: cadence,
    });
    snapshot.runId = persisted.runId;
    memory = { snapshot, atMs: now.getTime() };
    return { snapshot, skippedReason: null };
  });

  if (!exclusive.ran) {
    const fallback = memory?.snapshot ?? emptySnapshot(now, env);
    return { snapshot: fallback, skippedReason: exclusive.skippedReason ?? "overlap" };
  }
  return exclusive.result!;
}

export function emptySnapshot(now: Date, env: Env = getEnv()): ScannerCenterSnapshot {
  const clock = readScannerClock(now);
  return {
    asOf: now.toISOString(),
    session: clock.session,
    sessionDate: clock.sessionDate,
    sessionPreset: clock.preset,
    system: "momentum",
    lists: {},
    alerts: [],
    selectedTicker: null,
    features: {},
    coverage: {
      freshness: "unavailable",
      providerName: null,
      feedCoverage: null,
      latencyClass: "unavailable",
      cadenceSeconds: scannerCadenceSeconds(clock.session, env),
      lastUpdate: null,
      nextUpdate: null,
      symbolsRequested: 0,
      symbolsReceived: 0,
      universeLimited: true,
      coverageNotes: ["Scanner has not produced a snapshot yet."],
      entitlements: {
        trades: false,
        quotes: false,
        float: false,
        news: false,
        halts: false,
        options: false,
        fullMarket: false,
      },
    },
    runId: null,
    mocked: false,
  };
}

export function sliceSnapshot(
  snapshot: ScannerCenterSnapshot,
  system: ScannerSystem,
): ScannerCenterSnapshot {
  return {
    ...snapshot,
    system,
    lists: listsForSystem(snapshot.lists, system),
    alerts: snapshot.alerts.filter((alert) => alert.system === system),
  };
}

export function scannerFirmId(env: Env = getEnv()): string {
  return env.FIRM_ID ?? DEFAULT_FIRM_UUID;
}
