import { opportunityScore, riskScore } from "./scoring";
import { strategyTitle } from "./strategies";
import type {
  RankedScannerRow,
  ScannerAlertEvent,
  ScannerFeatureSnapshot,
  ScannerSystem,
} from "./types";

export function toRankedRow(
  feature: ScannerFeatureSnapshot,
  strategyId: string,
  rank: number,
): RankedScannerRow {
  return {
    ticker: feature.ticker,
    name: feature.name,
    strategyId,
    system: strategyId.startsWith("desk_") ? "desk" : "momentum",
    rank,
    last: feature.last,
    changeFromClosePct: feature.changeFromClosePct,
    changeFromOpenPct: feature.changeFromOpenPct,
    gapPercent: feature.gapPercent,
    velocity5mPct: feature.velocity5mPct,
    volume: feature.volume,
    dollarVolume: feature.dollarVolume,
    relativeVolume: feature.relativeVolume,
    fiveMinuteRelativeVolume: feature.fiveMinuteRelativeVolume,
    floatShares: feature.floatShares,
    floatRotation: feature.floatRotation,
    marketCap: feature.marketCap,
    distanceFromHodPct: feature.distanceFromHodPct,
    vwap: feature.vwap,
    week52High: feature.week52High,
    atr: feature.atr,
    spreadFraction: feature.spreadFraction,
    shortInterestPct: feature.shortInterestPct,
    recentReverseSplit: feature.recentReverseSplit,
    ipoAgeDays: feature.ipoAgeDays,
    haltStatus: feature.haltStatus,
    haltReason: feature.haltReason ?? null,
    newsFreshness: feature.newsFreshness,
    catalystKind: feature.catalystKind,
    catalystSummary: feature.explanation.headline,
    inWatchlist: feature.inWatchlist,
    inPosition: feature.inPosition,
    themes: feature.themes,
    opportunity: opportunityScore(feature),
    risk: riskScore(feature),
    asOf: feature.asOf,
    stale: feature.stale,
    dataQuality: feature.dataQuality,
    coverageNotes: feature.coverageNotes,
  };
}

export function toAlertEvent(input: {
  id: string;
  feature: ScannerFeatureSnapshot;
  strategyId: string;
  system: ScannerSystem;
  firedAt: string;
  lastSeenAt: string;
  status: ScannerAlertEvent["status"];
  consolidationId: string | null;
  occurrenceCount: number;
  rank?: number;
}): ScannerAlertEvent {
  const row = toRankedRow(input.feature, input.strategyId, input.rank ?? 1);
  return {
    id: input.id,
    system: input.system,
    strategyId: input.strategyId,
    strategyTitle: strategyTitle(input.strategyId),
    ticker: input.feature.ticker,
    name: input.feature.name,
    firedAt: input.firedAt,
    lastSeenAt: input.lastSeenAt,
    session: input.feature.session,
    sessionDate: input.feature.sessionDate,
    status: input.status,
    consolidationId: input.consolidationId,
    occurrenceCount: input.occurrenceCount,
    last: input.feature.last,
    changeFromClosePct: input.feature.changeFromClosePct,
    changeFromOpenPct: input.feature.changeFromOpenPct,
    velocity5mPct: input.feature.velocity5mPct,
    relativeVolume: input.feature.relativeVolume,
    dollarVolume: input.feature.dollarVolume,
    floatShares: input.feature.floatShares,
    haltStatus: input.feature.haltStatus,
    newsFreshness: input.feature.newsFreshness,
    catalystKind: input.feature.catalystKind,
    explanation: input.feature.explanation,
    opportunity: row.opportunity,
    risk: row.risk,
    row,
  };
}
