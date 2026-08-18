import { decideAlert } from "./alerts";
import { toAlertEvent, toRankedRow } from "./rows";
import { SCANNER_STRATEGIES } from "./strategies";
import type {
  PriorAlertState,
  RankedScannerRow,
  ScannerAlertEvent,
  ScannerFeatureSnapshot,
  ScannerStrategyDef,
  ScannerSystem,
} from "./types";

export type EvaluateScanInput = {
  features: ScannerFeatureSnapshot[];
  now: Date;
  sessionDate: string;
  priorAlerts?: PriorAlertState[];
  strategies?: ScannerStrategyDef[];
  listLimit?: number;
  idFactory?: () => string;
};

export type EvaluateScanResult = {
  lists: Record<string, RankedScannerRow[]>;
  alerts: ScannerAlertEvent[];
  suppressed: number;
  consolidated: number;
  emitted: number;
};

function priorKey(ticker: string, strategyId: string): string {
  return `${ticker.toUpperCase()}:${strategyId}`;
}

export function evaluateScan(input: EvaluateScanInput): EvaluateScanResult {
  const strategies = input.strategies ?? SCANNER_STRATEGIES;
  const listLimit = input.listLimit ?? 25;
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());
  const nowIso = input.now.toISOString();
  const prior = new Map<string, PriorAlertState>();
  for (const item of input.priorAlerts ?? []) {
    const key = priorKey(item.ticker, item.strategyId);
    const existing = prior.get(key);
    if (!existing || Date.parse(item.lastSeenAt) > Date.parse(existing.lastSeenAt)) {
      prior.set(key, item);
    }
  }

  const lists: Record<string, RankedScannerRow[]> = {};
  const alerts: ScannerAlertEvent[] = [];
  let suppressed = 0;
  let consolidated = 0;
  let emitted = 0;

  for (const strategy of strategies) {
    const hits = input.features
      .filter((feature) => {
        if (strategy.sessions !== "*" && !strategy.sessions.includes(feature.session)) {
          return false;
        }
        return strategy.match(feature);
      })
      .sort((a, b) => strategy.rank(b) - strategy.rank(a));

    if (strategy.kind === "ranked" || strategy.kind === "both") {
      lists[strategy.id] = hits
        .slice(0, listLimit)
        .map((feature, index) => toRankedRow(feature, strategy.id, index + 1));
    }

    if (strategy.kind === "alert" || strategy.kind === "both") {
      for (const feature of hits) {
        const key = priorKey(feature.ticker, strategy.id);
        const previous = prior.get(key) ?? null;
        const decision = decideAlert({
          ticker: feature.ticker,
          strategyId: strategy.id,
          sessionDate: input.sessionDate,
          now: input.now,
          last: feature.last,
          prior: previous,
          policy: {
            cooldownSeconds: strategy.cooldownSeconds,
            consolidateSeconds: strategy.consolidateSeconds,
            oncePerSession: strategy.oncePerSession,
          },
        });

        if (decision.action === "suppress") {
          suppressed += 1;
          continue;
        }

        if (decision.action === "consolidate" && previous) {
          consolidated += 1;
          const updated = toAlertEvent({
            id: previous.id,
            feature,
            strategyId: strategy.id,
            system: strategy.system,
            firedAt: previous.firedAt,
            lastSeenAt: nowIso,
            status: "consolidated",
            consolidationId: previous.id,
            occurrenceCount: previous.occurrenceCount + 1,
          });
          alerts.push(updated);
          prior.set(key, {
            ...previous,
            lastSeenAt: nowIso,
            last: feature.last,
            occurrenceCount: previous.occurrenceCount + 1,
            status: "consolidated",
          });
          continue;
        }

        emitted += 1;
        const id = idFactory();
        const event = toAlertEvent({
          id,
          feature,
          strategyId: strategy.id,
          system: strategy.system,
          firedAt: nowIso,
          lastSeenAt: nowIso,
          status: "active",
          consolidationId: null,
          occurrenceCount: 1,
        });
        alerts.push(event);
        prior.set(key, {
          id,
          ticker: feature.ticker,
          strategyId: strategy.id,
          sessionDate: input.sessionDate,
          firedAt: nowIso,
          lastSeenAt: nowIso,
          last: feature.last,
          occurrenceCount: 1,
          status: "active",
        });
      }
    }
  }

  alerts.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  return { lists, alerts, suppressed, consolidated, emitted };
}

export function listsForSystem(
  lists: Record<string, RankedScannerRow[]>,
  system: ScannerSystem,
): Record<string, RankedScannerRow[]> {
  const out: Record<string, RankedScannerRow[]> = {};
  for (const [id, rows] of Object.entries(lists)) {
    const strategy = SCANNER_STRATEGIES.find((item) => item.id === id);
    if (strategy?.system === system) out[id] = rows;
  }
  return out;
}
