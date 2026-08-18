import { evaluateScan } from "./evaluate";
import { buildFeatureSnapshot } from "./features";
import { SCANNER_STRATEGIES } from "./strategies";
import type { MinuteBar, PriorAlertState, ScannerAlertEvent, ScannerFeatureSnapshot } from "./types";

export function replaySyntheticSequence(input: {
  ticker: string;
  sessionDate: string;
  session?: ScannerFeatureSnapshot["session"];
  prints: Array<{
    at: string;
    last: number;
    high?: number;
    open?: number;
    priorClose?: number;
    volume?: number;
    avgVolume20d?: number;
    floatShares?: number;
    bars?: MinuteBar[];
  }>;
  strategyIds?: string[];
}) {
  const alerts: ScannerAlertEvent[] = [];
  const prior: PriorAlertState[] = [];
  const snapshots: ScannerFeatureSnapshot[] = [];
  const strategies = input.strategyIds
    ? SCANNER_STRATEGIES.filter((item) => input.strategyIds!.includes(item.id))
    : SCANNER_STRATEGIES;

  for (const print of input.prints) {
    const feature = buildFeatureSnapshot({
      ticker: input.ticker,
      asOf: print.at,
      session: input.session ?? "regular",
      sessionDate: input.sessionDate,
      last: print.last,
      high: print.high ?? print.last,
      open: print.open ?? print.last,
      priorClose: print.priorClose ?? print.last,
      volume: print.volume ?? 1_000_000,
      avgVolume20d: print.avgVolume20d ?? 200_000,
      floatShares: print.floatShares ?? 10_000_000,
      minuteBars: print.bars,
      providerName: "synthetic",
      feedCoverage: "unknown",
      latencyClass: "mock",
      attributionKind: "confirmed_company",
      attributionHeadline: "Synthetic confirmed catalyst",
      latestHeadlineAt: print.at,
    });
    snapshots.push(feature);
    const result = evaluateScan({
      features: [feature],
      now: new Date(print.at),
      sessionDate: input.sessionDate,
      priorAlerts: prior,
      strategies,
    });
    for (const alert of result.alerts) {
      alerts.push(alert);
      const existing = prior.findIndex(
        (row) => row.ticker === alert.ticker && row.strategyId === alert.strategyId,
      );
      const state: PriorAlertState = {
        id: alert.id,
        ticker: alert.ticker,
        strategyId: alert.strategyId,
        sessionDate: alert.sessionDate,
        firedAt: alert.firedAt,
        lastSeenAt: alert.lastSeenAt,
        last: alert.last,
        occurrenceCount: alert.occurrenceCount,
        status: alert.status,
      };
      if (existing >= 0) prior[existing] = state;
      else prior.push(state);
    }
  }
  return { snapshots, alerts };
}
