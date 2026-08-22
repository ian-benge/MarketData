import { z } from "zod";
import type { ExtendedMarketSession, FeedCoverage, LatencyClass } from "@/lib/market-data/schemas";
import type { AttributionKind, ConfidenceLevel, EventType } from "@/lib/intelligence/types";

export const SCANNER_SYSTEMS = ["momentum", "desk"] as const;
export type ScannerSystem = (typeof SCANNER_SYSTEMS)[number];

export const SCANNER_SYSTEM_LABELS: Record<ScannerSystem, string> = {
  momentum: "Ross · Warrior Trading",
  desk: "Desk Intelligence",
};

export const SCANNER_SYSTEM_BLURBS: Record<ScannerSystem, string> = {
  momentum:
    "Ross Cameron / Warrior Trading style momentum scanner (public behavior model — not affiliated with Warrior Trading).",
  desk: "Institutional desk scanner for watchlists, book, sectors, and catalysts.",
};

export const SCANNER_SESSION_PRESETS = [
  "premarket",
  "open",
  "midday",
  "power_hour",
  "after_hours",
] as const;
export type ScannerSessionPreset = (typeof SCANNER_SESSION_PRESETS)[number];

export const NEWS_FRESHNESS_BUCKETS = ["0_2h", "2_12h", "12_24h", "none"] as const;
export type NewsFreshnessBucket = (typeof NEWS_FRESHNESS_BUCKETS)[number];

export const CATALYST_KINDS = [
  "confirmed_company",
  "likely_catalyst",
  "sector_sympathy",
  "technical",
  "macro",
  "unexplained",
] as const;
export type CatalystKind = (typeof CATALYST_KINDS)[number];

export const HALT_STATUSES = ["open", "halted", "resumed", "unknown"] as const;
export type HaltStatus = (typeof HALT_STATUSES)[number];

export const MARKET_CAP_CATEGORIES = [
  "mega",
  "large",
  "mid",
  "small",
  "micro",
  "nano",
  "unknown",
] as const;
export type ScannerMarketCapCategory = (typeof MARKET_CAP_CATEGORIES)[number];

export const PRICE_REGIMES = ["penny", "low_float", "small_cap", "large_cap", "etf"] as const;
export type PriceRegime = (typeof PRICE_REGIMES)[number];

export const DATA_FRESHNESS_STATES = [
  "live",
  "delayed",
  "stale",
  "partial",
  "unavailable",
  "mock",
] as const;
export type DataFreshnessState = (typeof DATA_FRESHNESS_STATES)[number];

export const ScoreFactorSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  weight: z.number(),
  contribution: z.number(),
  note: z.string(),
});
export type ScoreFactor = z.infer<typeof ScoreFactorSchema>;

export const TransparentScoreSchema = z.object({
  total: z.number(),
  factors: z.array(ScoreFactorSchema),
});
export type TransparentScore = z.infer<typeof TransparentScoreSchema>;

export const LinkedEvidenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable(),
  publishedAt: z.string(),
  eventType: z.string().nullable(),
});
export type LinkedEvidence = z.infer<typeof LinkedEvidenceSchema>;

export const MoverExplanationSchema = z.object({
  headline: z.string(),
  detail: z.string(),
  catalystKind: z.enum(CATALYST_KINDS),
  attribution: z.string(),
  confidence: z.string(),
  competing: z.array(z.string()),
  unresolved: z.boolean(),
  whyNow: z.string(),
  relatedTickers: z.array(z.string()),
  confirmation: z.string(),
  invalidation: z.string(),
  evidence: z.array(LinkedEvidenceSchema),
});
export type ScannerMoverExplanation = z.infer<typeof MoverExplanationSchema>;

export const DataQualitySchema = z.object({
  price: z.boolean(),
  volume: z.boolean(),
  float: z.boolean(),
  news: z.boolean(),
  bars: z.boolean(),
  fundamentals: z.boolean(),
  options: z.boolean(),
  halt: z.boolean(),
});
export type DataQuality = z.infer<typeof DataQualitySchema>;

export type MinuteBar = {
  start: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ScannerFeatureSnapshot = {
  ticker: string;
  name: string | null;
  asOf: string;
  session: ExtendedMarketSession;
  sessionDate: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  spreadFraction: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  priorClose: number | null;
  officialClose: number | null;
  volume: number | null;
  dollarVolume: number | null;
  avgVolume20d: number | null;
  relativeVolume: number | null;
  sessionRelativeVolume: number | null;
  fiveMinuteVolume: number | null;
  fiveMinuteRelativeVolume: number | null;
  changeFromClosePct: number | null;
  changeFromOpenPct: number | null;
  gapPercent: number | null;
  velocity5mPct: number | null;
  velocity10mPct: number | null;
  acceleration: number | null;
  distanceFromHodPct: number | null;
  nearHod: boolean;
  newHod: boolean;
  vwap: number | null;
  atr: number | null;
  week52High: number | null;
  distanceFrom52wHighPct: number | null;
  floatShares: number | null;
  sharesOutstanding: number | null;
  floatRotation: number | null;
  marketCap: number | null;
  marketCapCategory: ScannerMarketCapCategory;
  shortInterestPct: number | null;
  ipoAgeDays: number | null;
  recentReverseSplit: boolean;
  reverseSplitDate: string | null;
  haltStatus: HaltStatus;
  haltReason: string | null;
  newsFreshness: NewsFreshnessBucket;
  catalystKind: CatalystKind;
  explanation: ScannerMoverExplanation;
  inWatchlist: boolean;
  inPosition: boolean;
  watchlistNames: string[];
  themes: string[];
  sectors: string[];
  isEtf: boolean;
  priceRegime: PriceRegime;
  formerRunner: boolean;
  gapAndFade: boolean;
  offeringRisk: boolean;
  frequentHalt: boolean;
  unusualOptions: boolean;
  optionsNote: string | null;
  providerName: string;
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  dataQuality: DataQuality;
  stale: boolean;
  coverageNotes: string | null;
};

export type StrategyKind = "ranked" | "alert" | "both";

export type ScannerStrategyDef = {
  id: string;
  system: ScannerSystem;
  kind: StrategyKind;
  title: string;
  shortTitle: string;
  description: string;
  sessions: ExtendedMarketSession[] | "*";
  oncePerSession: boolean;
  cooldownSeconds: number;
  consolidateSeconds: number;
  audioKey: string;
  match: (feature: ScannerFeatureSnapshot) => boolean;
  rank: (feature: ScannerFeatureSnapshot) => number;
};

export type RankedScannerRow = {
  ticker: string;
  name: string | null;
  strategyId: string;
  system: ScannerSystem;
  rank: number;
  last: number | null;
  changeFromClosePct: number | null;
  changeFromOpenPct: number | null;
  gapPercent: number | null;
  velocity5mPct: number | null;
  volume: number | null;
  dollarVolume: number | null;
  relativeVolume: number | null;
  fiveMinuteRelativeVolume: number | null;
  floatShares: number | null;
  floatRotation: number | null;
  marketCap: number | null;
  distanceFromHodPct: number | null;
  vwap: number | null;
  week52High: number | null;
  atr: number | null;
  spreadFraction: number | null;
  shortInterestPct: number | null;
  recentReverseSplit: boolean;
    ipoAgeDays: number | null;
    haltStatus: HaltStatus;
    haltReason: string | null;
    newsFreshness: NewsFreshnessBucket;
    catalystKind: CatalystKind;
    catalystSummary: string;
  inWatchlist: boolean;
  inPosition: boolean;
  themes: string[];
  opportunity: TransparentScore;
  risk: TransparentScore;
  asOf: string;
  stale: boolean;
  dataQuality: DataQuality;
  coverageNotes: string | null;
};

export type ScannerAlertEvent = {
  id: string;
  system: ScannerSystem;
  strategyId: string;
  strategyTitle: string;
  ticker: string;
  name: string | null;
  firedAt: string;
  lastSeenAt: string;
  session: ExtendedMarketSession;
  sessionDate: string;
  status: "active" | "consolidated" | "suppressed" | "expired";
  consolidationId: string | null;
  occurrenceCount: number;
  last: number | null;
  changeFromClosePct: number | null;
  changeFromOpenPct: number | null;
  velocity5mPct: number | null;
  relativeVolume: number | null;
  dollarVolume: number | null;
  floatShares: number | null;
  haltStatus: HaltStatus;
  newsFreshness: NewsFreshnessBucket;
  catalystKind: CatalystKind;
  explanation: ScannerMoverExplanation;
  opportunity: TransparentScore;
  risk: TransparentScore;
  row: RankedScannerRow;
};

export type ScannerCoverageMeta = {
  freshness: DataFreshnessState;
  providerName: string | null;
  feedCoverage: FeedCoverage | null;
  latencyClass: LatencyClass | null;
  cadenceSeconds: number;
  lastUpdate: string | null;
  nextUpdate: string | null;
  symbolsRequested: number;
  symbolsReceived: number;
  universeLimited: boolean;
  coverageNotes: string[];
  entitlements: {
    trades: boolean;
    quotes: boolean;
    float: boolean;
    news: boolean;
    halts: boolean;
    options: boolean;
    fullMarket: boolean;
  };
};

export type ScannerCenterSnapshot = {
  asOf: string;
  session: ExtendedMarketSession;
  sessionDate: string;
  sessionPreset: ScannerSessionPreset;
  system: ScannerSystem;
  lists: Record<string, RankedScannerRow[]>;
  alerts: ScannerAlertEvent[];
  selectedTicker: string | null;
  features: Record<string, ScannerFeatureSnapshot>;
  coverage: ScannerCoverageMeta;
  runId: string | null;
  mocked: boolean;
};

export type ScannerUserState = {
  pins: string[];
  mutes: Array<{ ticker: string; strategyId: string; mutedUntil: string | null }>;
  settings: ScannerAlertSettings;
  presets: ScannerPreset[];
};

export type ScannerAlertSettings = {
  audioEnabled: boolean;
  desktopEnabled: boolean;
  mutedStrategies: string[];
  cooldownSecondsOverride: number | null;
  consolidateSecondsOverride: number | null;
  strategyAudio: Record<string, boolean>;
};

export const DEFAULT_ALERT_SETTINGS: ScannerAlertSettings = {
  audioEnabled: true,
  desktopEnabled: false,
  mutedStrategies: [],
  cooldownSecondsOverride: null,
  consolidateSecondsOverride: null,
  strategyAudio: {},
};

export type ScannerPreset = {
  id: string;
  name: string;
  system: ScannerSystem;
  layout: ScannerLayout;
  isDefault: boolean;
};

export type ScannerLayout = {
  sessionPreset: ScannerSessionPreset;
  strategies: string[];
  columns: string[];
  filters: ScannerFilters;
  sort: { key: string; dir: "asc" | "desc" };
};

export type ScannerFilters = {
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
  minRvol: number | null;
  maxFloatMm: number | null;
  minDollarVolume: number | null;
  watchlistOnly: boolean;
  inPositionOnly: boolean;
  newsFreshness: NewsFreshnessBucket[] | null;
  themes: string[];
  hideHalted: boolean;
  hideMuted: boolean;
};

export const DEFAULT_SCANNER_FILTERS: ScannerFilters = {
  query: "",
  minPrice: null,
  maxPrice: null,
  minRvol: null,
  maxFloatMm: null,
  minDollarVolume: null,
  watchlistOnly: false,
  inPositionOnly: false,
  newsFreshness: null,
  themes: [],
  hideHalted: false,
  hideMuted: true,
};

export type AlertDecision =
  | { action: "fire"; reason: string }
  | { action: "consolidate"; reason: string; priorId: string }
  | { action: "suppress"; reason: string };

export type PriorAlertState = {
  id: string;
  ticker: string;
  strategyId: string;
  sessionDate: string;
  firedAt: string;
  lastSeenAt: string;
  last: number | null;
  occurrenceCount: number;
  status: ScannerAlertEvent["status"];
};

export type QualitySample = {
  ticker: string;
  strategyId: string;
  firedAt: string;
  entry: number;
  forward: Array<{ at: string; price: number }>;
};

export type AlertQualityReport = {
  sampleSize: number;
  continuationRate: number | null;
  medianForwardReturnPct: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
  medianLatencyMs: number | null;
  falsePositiveRate: number | null;
  note: string;
};

export const NEWS_FRESHNESS_LABELS: Record<NewsFreshnessBucket, string> = {
  "0_2h": "0–2 hours",
  "2_12h": "2–12 hours",
  "12_24h": "12–24 hours",
  none: "No qualifying headline",
};

export const CATALYST_LABELS: Record<CatalystKind, string> = {
  confirmed_company: "Confirmed catalyst",
  likely_catalyst: "Likely catalyst",
  sector_sympathy: "Sector / sympathy",
  technical: "Technical / breakout",
  macro: "Macro-driven",
  unexplained: "Unexplained",
};

export type AttributionInput = {
  kind: AttributionKind;
  confidence: ConfidenceLevel;
  headline: string;
  detail: string;
  eventType?: EventType | null;
  evidence: LinkedEvidence[];
  relatedTickers: string[];
};
