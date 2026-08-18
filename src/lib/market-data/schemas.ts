import { z } from "zod";

/** Feed / coverage provenance — never claim IEX is SIP, full_market, or NBBO. */
export const FeedCoverageSchema = z.enum([
  "iex",
  "sip",
  "fmv",
  "full_market",
  "official_release",
  "delayed_15m",
  "eod",
  "unknown",
]);
export type FeedCoverage = z.infer<typeof FeedCoverageSchema>;

export const LatencyClassSchema = z.enum([
  "realtime",
  "delayed_15m",
  "eod",
  "stale",
  "unavailable",
  "mock",
]);
export type LatencyClass = z.infer<typeof LatencyClassSchema>;

export const LicenseScopeSchema = z.enum([
  "single_user_development",
  "internal_team",
  "redistributable",
]);
export type LicenseScope = z.infer<typeof LicenseScopeSchema>;

export const ProductSurfaceSchema = z.enum([
  "dashboard_display",
  "server_calculations",
  "archived_normalized",
  "derived_charts",
  "in_app_reports",
  "pdf_inclusion",
  "email_attachment",
  "ai_analysis_input",
]);
export type ProductSurface = z.infer<typeof ProductSurfaceSchema>;

/** Extended session model for the realtime market-data layer. */
export const ExtendedMarketSessionSchema = z.enum([
  "overnight",
  "premarket",
  "regular",
  "afterhours",
  "closed",
]);
export type ExtendedMarketSession = z.infer<typeof ExtendedMarketSessionSchema>;

export const ValueKindSchema = z.enum(["raw", "normalized", "derived"]);
export type ValueKind = z.infer<typeof ValueKindSchema>;

export const EntitlementErrorCodeSchema = z.enum([
  "unauthorized_feed",
  "plan_limit",
  "feature_unavailable",
  "license_scope",
  "http_401",
  "http_403",
]);
export type EntitlementErrorCode = z.infer<typeof EntitlementErrorCodeSchema>;

export class EntitlementError extends Error {
  readonly code: EntitlementErrorCode;
  readonly providerName?: string;
  readonly httpStatus?: number;

  constructor(
    code: EntitlementErrorCode,
    message: string,
    options?: { providerName?: string; httpStatus?: number; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "EntitlementError";
    this.code = code;
    this.providerName = options?.providerName;
    this.httpStatus = options?.httpStatus;
  }
}

export const ObservationMetadataSchema = z.object({
  providerName: z.string(),
  providerTimestamp: z.string(),
  retrievalTimestamp: z.string(),
  feedCoverage: FeedCoverageSchema,
  latencyClass: LatencyClassSchema,
  /** Non-secret license scope identifier (e.g. scope enum or config id). */
  licenseScopeId: z.string(),
  permittedSurfaces: z.array(ProductSurfaceSchema).default([]),
  valueKind: ValueKindSchema.default("normalized"),
  persistedAt: z.string().optional(),
  marketSession: ExtendedMarketSessionSchema.optional(),
  currency: z.string().optional(),
  coverageNotes: z.string().optional(),
  sourceQuality: z
    .enum(["primary", "secondary", "estimated", "mock"])
    .optional(),
});
export type ObservationMetadata = z.infer<typeof ObservationMetadataSchema>;

const finiteOrNull = z.number().finite().nullable();

export const NormalizedQuoteObservationSchema = ObservationMetadataSchema.extend(
  {
    instrumentId: z.string(),
    ticker: z.string(),
    last: finiteOrNull,
    bid: finiteOrNull.optional(),
    ask: finiteOrNull.optional(),
    open: finiteOrNull.optional(),
    high: finiteOrNull.optional(),
    low: finiteOrNull.optional(),
    priorClose: finiteOrNull.optional(),
    volume: finiteOrNull.optional(),
    changeAbsolute: finiteOrNull.optional(),
    changePercent: finiteOrNull.optional(),
    preMarketChangePercent: finiteOrNull.optional(),
    afterHoursChangePercent: finiteOrNull.optional(),
    officialClose: finiteOrNull.optional(),
    marketSession: ExtendedMarketSessionSchema,
  },
);
export type NormalizedQuoteObservation = z.infer<
  typeof NormalizedQuoteObservationSchema
>;

export const NormalizedBarObservationSchema = ObservationMetadataSchema.extend({
  instrumentId: z.string(),
  ticker: z.string(),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]),
  open: finiteOrNull,
  high: finiteOrNull,
  low: finiteOrNull,
  close: finiteOrNull,
  volume: finiteOrNull.optional(),
  barStart: z.string(),
  barEnd: z.string().optional(),
  marketSession: ExtendedMarketSessionSchema.optional(),
});
export type NormalizedBarObservation = z.infer<
  typeof NormalizedBarObservationSchema
>;

export const NormalizedSnapshotObservationSchema =
  NormalizedQuoteObservationSchema.extend({
    minuteOpen: finiteOrNull.optional(),
    minuteHigh: finiteOrNull.optional(),
    minuteLow: finiteOrNull.optional(),
    minuteClose: finiteOrNull.optional(),
    minuteVolume: finiteOrNull.optional(),
    dailyOpen: finiteOrNull.optional(),
    dailyHigh: finiteOrNull.optional(),
    dailyLow: finiteOrNull.optional(),
    dailyClose: finiteOrNull.optional(),
    dailyVolume: finiteOrNull.optional(),
  });
export type NormalizedSnapshotObservation = z.infer<
  typeof NormalizedSnapshotObservationSchema
>;

export const NormalizedMoverObservationSchema = ObservationMetadataSchema.extend(
  {
    instrumentId: z.string(),
    ticker: z.string(),
    name: z.string().optional(),
    last: finiteOrNull,
    changeAbsolute: finiteOrNull,
    changePercent: finiteOrNull,
    volume: finiteOrNull.optional(),
    direction: z.enum(["up", "down"]),
    marketSession: ExtendedMarketSessionSchema,
  },
);
export type NormalizedMoverObservation = z.infer<
  typeof NormalizedMoverObservationSchema
>;

export const NormalizedInstrumentSchema = ObservationMetadataSchema.extend({
  instrumentId: z.string(),
  ticker: z.string(),
  name: z.string().nullable().optional(),
  exchange: z.string().nullable().optional(),
  assetClass: z.string().optional(),
  currency: z.string().default("USD"),
  active: z.boolean().optional(),
  figi: z.string().nullable().optional(),
  cik: z.string().nullable().optional(),
});
export type NormalizedInstrument = z.infer<typeof NormalizedInstrumentSchema>;

export const NormalizedCorporateActionSchema = ObservationMetadataSchema.extend(
  {
    id: z.string(),
    ticker: z.string(),
    actionType: z.enum([
      "dividend",
      "split",
      "ticker_change",
      "spinoff",
      "merger",
      "other",
    ]),
    exDate: z.string().optional(),
    payDate: z.string().optional(),
    recordDate: z.string().optional(),
    declarationDate: z.string().optional(),
    cashAmount: finiteOrNull.optional(),
    splitFrom: finiteOrNull.optional(),
    splitTo: finiteOrNull.optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  },
);
export type NormalizedCorporateAction = z.infer<
  typeof NormalizedCorporateActionSchema
>;

export const NormalizedMarketStatusSchema = ObservationMetadataSchema.extend({
  asOf: z.string(),
  session: ExtendedMarketSessionSchema,
  isOpen: z.boolean(),
  nextOpen: z.string().nullable().optional(),
  nextClose: z.string().nullable().optional(),
  rawMarket: z.string().optional(),
});
export type NormalizedMarketStatus = z.infer<
  typeof NormalizedMarketStatusSchema
>;

function batchMeta() {
  return z.object({
    providerName: z.string(),
    retrievalTimestamp: z.string(),
    feedCoverage: FeedCoverageSchema,
    latencyClass: LatencyClassSchema,
    licenseScopeId: z.string(),
    permittedSurfaces: z.array(ProductSurfaceSchema).default([]),
    usedFallback: z.boolean().optional(),
    healthNotes: z.array(z.string()).optional(),
  });
}

export const NormalizedQuoteBatchSchema = batchMeta().extend({
  quotes: z.array(NormalizedQuoteObservationSchema),
});
export type NormalizedQuoteBatch = z.infer<typeof NormalizedQuoteBatchSchema>;

export const NormalizedBarBatchSchema = batchMeta().extend({
  bars: z.array(NormalizedBarObservationSchema),
});
export type NormalizedBarBatch = z.infer<typeof NormalizedBarBatchSchema>;

export const NormalizedSnapshotBatchSchema = batchMeta().extend({
  snapshots: z.array(NormalizedSnapshotObservationSchema),
});
export type NormalizedSnapshotBatch = z.infer<
  typeof NormalizedSnapshotBatchSchema
>;

export const NormalizedMoverBatchSchema = batchMeta().extend({
  movers: z.array(NormalizedMoverObservationSchema),
});
export type NormalizedMoverBatch = z.infer<typeof NormalizedMoverBatchSchema>;

export const NormalizedInstrumentBatchSchema = batchMeta().extend({
  instruments: z.array(NormalizedInstrumentSchema),
});
export type NormalizedInstrumentBatch = z.infer<
  typeof NormalizedInstrumentBatchSchema
>;

export const NormalizedCorporateActionBatchSchema = batchMeta().extend({
  actions: z.array(NormalizedCorporateActionSchema),
});
export type NormalizedCorporateActionBatch = z.infer<
  typeof NormalizedCorporateActionBatchSchema
>;

export const QuoteRequestSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1),
  surface: ProductSurfaceSchema.default("dashboard_display"),
  asOf: z.string().optional(),
});
export type QuoteRequest = z.input<typeof QuoteRequestSchema>;

export const BarsRequestSchema = z.object({
  symbol: z.string().min(1),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]).default("1m"),
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z.number().int().positive().optional(),
  surface: ProductSurfaceSchema.default("dashboard_display"),
  adjusted: z.boolean().optional(),
});
export type BarsRequest = z.input<typeof BarsRequestSchema>;

export const SnapshotRequestSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1),
  surface: ProductSurfaceSchema.default("dashboard_display"),
});
export type SnapshotRequest = z.input<typeof SnapshotRequestSchema>;

export const MoversRequestSchema = z.object({
  universe: z.array(z.string().min(1)).min(1),
  direction: z.enum(["up", "down", "both"]).default("both"),
  limit: z.number().int().positive().default(25),
  session: ExtendedMarketSessionSchema.optional(),
  surface: ProductSurfaceSchema.default("dashboard_display"),
});
export type MoversRequest = z.input<typeof MoversRequestSchema>;

export const InstrumentRequestSchema = z.object({
  tickers: z.array(z.string().min(1)).optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().default(50),
  surface: ProductSurfaceSchema.default("server_calculations"),
});
export type InstrumentRequest = z.input<typeof InstrumentRequestSchema>;

export const CorporateActionsRequestSchema = z.object({
  ticker: z.string().min(1),
  types: z
    .array(z.enum(["dividend", "split", "ticker_change", "spinoff", "merger", "other"]))
    .optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z.number().int().positive().default(100),
  surface: ProductSurfaceSchema.default("server_calculations"),
});
export type CorporateActionsRequest = z.input<
  typeof CorporateActionsRequestSchema
>;

export function isClosedMarketSession(
  session?: string | null,
): boolean {
  return session === "closed";
}

/**
 * Provider delayStatus can stay "realtime" after the cash session ends.
 * Closed tape is last print / EOD — never advertise it as live.
 */
export function effectiveLatencyClass(
  latencyClass: LatencyClass,
  marketSession?: string | null,
): LatencyClass {
  if (
    isClosedMarketSession(marketSession) &&
    (latencyClass === "realtime" || latencyClass === "delayed_15m")
  ) {
    return "eod";
  }
  return latencyClass;
}

function feedSuffix(feedCoverage: FeedCoverage): string | null {
  switch (feedCoverage) {
    case "iex":
      return "IEX";
    case "sip":
      return "SIP";
    case "fmv":
      return "FMV/aggregate";
    case "full_market":
      return "full market";
    default:
      return null;
  }
}

/**
 * Human-readable latency + coverage label for UI / reports.
 * Never labels IEX as SIP/full_market/NBBO.
 * Never says Real-time when the cash session is closed.
 */
export function latencyCoverageLabel(input: {
  feedCoverage: FeedCoverage;
  latencyClass: LatencyClass;
  marketSession?: string | null;
}): string {
  const feedCoverage = input.feedCoverage;
  const latencyClass = effectiveLatencyClass(
    input.latencyClass,
    input.marketSession,
  );

  if (latencyClass === "mock") return "Mock data";
  if (latencyClass === "stale") return "Stale";
  if (latencyClass === "unavailable") return "Unavailable";
  if (latencyClass === "delayed_15m") return "15-minute delayed";
  if (latencyClass === "eod") {
    const suffix = feedSuffix(feedCoverage);
    return suffix ? `End of day — ${suffix}` : "End of day";
  }

  if (latencyClass === "realtime") {
    const suffix = feedSuffix(feedCoverage);
    return suffix ? `Real-time — ${suffix}` : "Real-time";
  }

  if (feedCoverage === "delayed_15m") return "15-minute delayed";
  if (feedCoverage === "eod") return "End of day";
  return "Unavailable";
}
