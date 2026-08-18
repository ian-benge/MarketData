import type { ExtendedMarketSession, FeedCoverage, LatencyClass } from "@/lib/market-data/schemas";
import {
  dollarVolume,
  fiveMinuteRelativeVolume,
  floatRotation,
  isNearHigh,
  isNewHigh,
  marketCapCategory,
  newsFreshnessBucket,
  relativeVolume,
  sessionRelativeVolume,
  sessionVwap,
  spreadFraction,
  accelerationFromBars,
  averageTrueRange,
  distanceFromHighPct,
  velocityFromBars,
  volumeInWindow,
  percentChange,
} from "./math";
import { buildExplanation } from "./explanation";
import type {
  CatalystKind,
  DataQuality,
  HaltStatus,
  LinkedEvidence,
  MinuteBar,
  PriceRegime,
  ScannerFeatureSnapshot,
} from "./types";
import type { AttributionKind } from "@/lib/intelligence/types";

export type FeatureBuildInput = {
  ticker: string;
  name?: string | null;
  asOf: string;
  session: ExtendedMarketSession;
  sessionDate: string;
  sessionElapsed?: number | null;
  last: number | null;
  bid?: number | null;
  ask?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  priorClose?: number | null;
  officialClose?: number | null;
  volume?: number | null;
  avgVolume20d?: number | null;
  minuteBars?: MinuteBar[];
  dailyBars?: MinuteBar[];
  previousHigh?: number | null;
  vwap?: number | null;
  week52High?: number | null;
  floatShares?: number | null;
  sharesOutstanding?: number | null;
  marketCap?: number | null;
  shortInterestPct?: number | null;
  ipoAgeDays?: number | null;
  recentReverseSplit?: boolean;
  reverseSplitDate?: string | null;
  haltStatus?: HaltStatus;
  haltReason?: string | null;
  latestHeadlineAt?: string | null;
  attributionKind?: AttributionKind | null;
  attributionHeadline?: string | null;
  attributionDetail?: string | null;
  evidence?: LinkedEvidence[];
  relatedTickers?: string[];
  technicalReason?: string | null;
  inWatchlist?: boolean;
  inPosition?: boolean;
  watchlistNames?: string[];
  themes?: string[];
  sectors?: string[];
  isEtf?: boolean;
  formerRunner?: boolean;
  gapAndFade?: boolean;
  offeringRisk?: boolean;
  frequentHalt?: boolean;
  unusualOptions?: boolean;
  optionsNote?: string | null;
  providerName: string;
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  stale?: boolean;
  coverageNotes?: string | null;
};

function regimeOf(input: FeatureBuildInput): PriceRegime {
  if (input.isEtf) return "etf";
  const last = input.last;
  const floatShares = input.floatShares;
  const cap = marketCapCategory(input.marketCap);
  if (last != null && last < 5) return "penny";
  if (floatShares != null && floatShares <= 20_000_000 && last != null && last <= 20) {
    return "low_float";
  }
  if (cap === "large" || cap === "mega") return "large_cap";
  return "small_cap";
}

function quality(input: FeatureBuildInput, bars: boolean): DataQuality {
  return {
    price: input.last != null && Number.isFinite(input.last),
    volume: input.volume != null && Number.isFinite(input.volume),
    float: input.floatShares != null && Number.isFinite(input.floatShares),
    news: Boolean(input.latestHeadlineAt) || Boolean(input.attributionKind),
    bars,
    fundamentals: input.marketCap != null || input.floatShares != null,
    options: Boolean(input.unusualOptions) || Boolean(input.optionsNote),
    halt: input.haltStatus != null && input.haltStatus !== "unknown",
  };
}

export function buildFeatureSnapshot(input: FeatureBuildInput): ScannerFeatureSnapshot {
  const bars = input.minuteBars ?? [];
  const asOfMs = Date.parse(input.asOf);
  const velocity5 = bars.length ? velocityFromBars(bars, 5, asOfMs) : null;
  const velocity10 = bars.length ? velocityFromBars(bars, 10, asOfMs) : null;
  const fiveMinVol = bars.length ? volumeInWindow(bars, 5, asOfMs) : null;
  const vwap = input.vwap ?? (bars.length ? sessionVwap(bars) : null);
  const atr = input.dailyBars?.length ? averageTrueRange(input.dailyBars) : null;
  const high = input.high ?? null;
  const last = input.last;
  const rvol = relativeVolume(input.volume, input.avgVolume20d);
  const newsFreshness = newsFreshnessBucket(input.latestHeadlineAt, new Date(input.asOf));
  const technical =
    input.technicalReason ??
    (isNearHigh(last, high) && (rvol ?? 0) >= 2
      ? "New or near session high on elevated volume"
      : null);
  const explanation = buildExplanation({
    feature: {
      ticker: input.ticker,
      changeFromClosePct: percentChange(last, input.priorClose),
      relativeVolume: rvol,
      inWatchlist: Boolean(input.inWatchlist),
      inPosition: Boolean(input.inPosition),
      themes: input.themes ?? [],
      sectors: input.sectors ?? [],
      haltStatus: input.haltStatus ?? "unknown",
      formerRunner: Boolean(input.formerRunner),
      newsFreshness,
      unusualOptions: Boolean(input.unusualOptions),
    },
    attributionKind: input.attributionKind,
    attributionHeadline: input.attributionHeadline,
    attributionDetail: input.attributionDetail,
    evidence: input.evidence,
    relatedTickers: input.relatedTickers,
    technicalReason: technical,
  });

  return {
    ticker: input.ticker.toUpperCase(),
    name: input.name ?? null,
    asOf: input.asOf,
    session: input.session,
    sessionDate: input.sessionDate,
    last,
    bid: input.bid ?? null,
    ask: input.ask ?? null,
    spreadFraction: spreadFraction(input.bid, input.ask),
    open: input.open ?? null,
    high,
    low: input.low ?? null,
    priorClose: input.priorClose ?? null,
    officialClose: input.officialClose ?? null,
    volume: input.volume ?? null,
    dollarVolume: dollarVolume(last, input.volume),
    avgVolume20d: input.avgVolume20d ?? null,
    relativeVolume: rvol,
    sessionRelativeVolume: sessionRelativeVolume(
      input.volume,
      input.avgVolume20d,
      input.sessionElapsed,
    ),
    fiveMinuteVolume: fiveMinVol,
    fiveMinuteRelativeVolume: fiveMinuteRelativeVolume(fiveMinVol, input.avgVolume20d),
    changeFromClosePct: percentChange(last, input.priorClose),
    changeFromOpenPct: percentChange(last, input.open),
    gapPercent: percentChange(input.open, input.priorClose),
    velocity5mPct: velocity5,
    velocity10mPct: velocity10,
    acceleration: bars.length ? accelerationFromBars(bars, 5) : null,
    distanceFromHodPct: distanceFromHighPct(last, high),
    nearHod: isNearHigh(last, high, 0.25),
    newHod: isNewHigh(last, high, input.previousHigh ?? null),
    vwap,
    atr,
    week52High: input.week52High ?? null,
    distanceFrom52wHighPct: distanceFromHighPct(last, input.week52High),
    floatShares: input.floatShares ?? null,
    sharesOutstanding: input.sharesOutstanding ?? null,
    floatRotation: floatRotation(input.volume, input.floatShares),
    marketCap: input.marketCap ?? null,
    marketCapCategory: marketCapCategory(input.marketCap),
    shortInterestPct: input.shortInterestPct ?? null,
    ipoAgeDays: input.ipoAgeDays ?? null,
    recentReverseSplit: Boolean(input.recentReverseSplit),
    reverseSplitDate: input.reverseSplitDate ?? null,
    haltStatus: input.haltStatus ?? "unknown",
    haltReason: input.haltReason ?? null,
    newsFreshness,
    catalystKind: explanation.catalystKind,
    explanation,
    inWatchlist: Boolean(input.inWatchlist),
    inPosition: Boolean(input.inPosition),
    watchlistNames: input.watchlistNames ?? [],
    themes: input.themes ?? [],
    sectors: input.sectors ?? [],
    isEtf: Boolean(input.isEtf),
    priceRegime: regimeOf(input),
    formerRunner: Boolean(input.formerRunner),
    gapAndFade: Boolean(input.gapAndFade),
    offeringRisk: Boolean(input.offeringRisk),
    frequentHalt: Boolean(input.frequentHalt),
    unusualOptions: Boolean(input.unusualOptions),
    optionsNote: input.optionsNote ?? null,
    providerName: input.providerName,
    feedCoverage: input.feedCoverage,
    latencyClass: input.latencyClass,
    dataQuality: quality(input, bars.length > 0 || input.dailyBars != null),
    stale: Boolean(input.stale),
    coverageNotes: input.coverageNotes ?? null,
  };
}

export function technicalCatalyst(feature: ScannerFeatureSnapshot): CatalystKind {
  if (feature.catalystKind !== "unexplained") return feature.catalystKind;
  if (feature.newHod || feature.nearHod) return "technical";
  return "unexplained";
}
