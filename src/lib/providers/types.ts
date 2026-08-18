import { z } from "zod";

/** Shared enums */

export const DelayStatusSchema = z.enum(["realtime", "delayed", "unknown"]);
export type DelayStatus = z.infer<typeof DelayStatusSchema>;

export const SourceQualitySchema = z.enum([
  "primary",
  "secondary",
  "estimated",
  "mock",
]);
export type SourceQuality = z.infer<typeof SourceQualitySchema>;

export const MarketSessionSchema = z.enum([
  "premarket",
  "regular",
  "afterhours",
  "closed",
  "unknown",
]);
export type MarketSession = z.infer<typeof MarketSessionSchema>;

export const CausalStatusSchema = z.enum([
  "confirmed",
  "reported",
  "inferred",
  "unclear",
]);
export type CausalStatus = z.infer<typeof CausalStatusSchema>;

export {
  ReportEditionSchema,
  type ReportEdition,
} from "@/lib/reports/editions";
import { ReportEditionSchema } from "@/lib/reports/editions";

/** Shared metadata fields used across normalized records */

export const ProviderMetadataSchema = z.object({
  instrumentId: z.string().optional(),
  ticker: z.string().optional(),
  value: z.number().nullable().optional(),
  units: z.string().optional(),
  marketSession: MarketSessionSchema.optional(),
  providerName: z.string(),
  providerTimestamp: z.string().datetime({ offset: true }).or(z.string()),
  retrievalTimestamp: z.string().datetime({ offset: true }).or(z.string()),
  delayStatus: DelayStatusSchema,
  currency: z.string().optional(),
  sourceQuality: SourceQualitySchema,
  coverageNotes: z.string().optional(),
});
export type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;

/** Normalized market / news / macro / corporate types */

export const NormalizedQuoteSchema = ProviderMetadataSchema.extend({
  instrumentId: z.string(),
  ticker: z.string(),
  last: z.number().nullable(),
  bid: z.number().nullable().optional(),
  ask: z.number().nullable().optional(),
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  priorClose: z.number().nullable().optional(),
  /** Today's official regular-session close when known (after-hours baseline). */
  officialClose: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  changeAbsolute: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  preMarketChangePercent: z.number().nullable().optional(),
  afterHoursChangePercent: z.number().nullable().optional(),
  marketSession: MarketSessionSchema,
  currency: z.string().default("USD"),
});
export type NormalizedQuote = z.infer<typeof NormalizedQuoteSchema>;

export const NormalizedBarSchema = ProviderMetadataSchema.extend({
  instrumentId: z.string(),
  ticker: z.string(),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable().optional(),
  barStart: z.string(),
  barEnd: z.string().optional(),
  currency: z.string().default("USD"),
});
export type NormalizedBar = z.infer<typeof NormalizedBarSchema>;

export const NormalizedBreadthSchema = ProviderMetadataSchema.extend({
  exchangeOrUniverse: z.string(),
  advancing: z.number().int().nullable(),
  declining: z.number().int().nullable(),
  unchanged: z.number().int().nullable().optional(),
  advVolume: z.number().nullable().optional(),
  decVolume: z.number().nullable().optional(),
  newHighs: z.number().int().nullable().optional(),
  newLows: z.number().int().nullable().optional(),
});
export type NormalizedBreadth = z.infer<typeof NormalizedBreadthSchema>;

export const NormalizedMoverSchema = ProviderMetadataSchema.extend({
  instrumentId: z.string(),
  ticker: z.string(),
  name: z.string().optional(),
  last: z.number().nullable(),
  changeAbsolute: z.number().nullable(),
  changePercent: z.number().nullable(),
  volume: z.number().nullable().optional(),
  relativeVolume: z.number().nullable().optional(),
  marketCapCategory: z
    .enum(["mega", "large", "mid", "small", "micro", "unknown"])
    .optional(),
  direction: z.enum(["up", "down"]),
  marketSession: MarketSessionSchema,
  currency: z.string().default("USD"),
});
export type NormalizedMover = z.infer<typeof NormalizedMoverSchema>;

export const NormalizedNewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  url: z.string().url().or(z.string()),
  canonicalUrl: z.string().optional(),
  contentHash: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: z.string(),
  retrievedAt: z.string(),
  tickers: z.array(z.string()).default([]),
  sourceClass: z
    .enum(["primary", "wire", "secondary", "blog", "unknown"])
    .default("unknown"),
  providerName: z.string(),
  sourceQuality: SourceQualitySchema,
  coverageNotes: z.string().optional(),
  excerpt: z.string().optional(),
});
export type NormalizedNewsItem = z.infer<typeof NormalizedNewsItemSchema>;

export const NormalizedMacroPointSchema = ProviderMetadataSchema.extend({
  seriesId: z.string(),
  seriesName: z.string().optional(),
  observationDate: z.string(),
  value: z.number().nullable(),
  units: z.string().optional(),
});
export type NormalizedMacroPoint = z.infer<typeof NormalizedMacroPointSchema>;

export const NormalizedCalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z
    .enum([
      "economic",
      "central_bank",
      "treasury",
      "political",
      "regulatory",
      "corporate",
      "other",
    ])
    .default("economic"),
  country: z.string().optional(),
  importance: z.enum(["low", "medium", "high"]).optional(),
  scheduledAt: z.string(),
  timeZone: z.string().default("America/Chicago"),
  actual: z.union([z.number(), z.string()]).nullable().optional(),
  consensus: z.union([z.number(), z.string()]).nullable().optional(),
  previous: z.union([z.number(), z.string()]).nullable().optional(),
  units: z.string().optional(),
  providerName: z.string(),
  providerTimestamp: z.string(),
  retrievalTimestamp: z.string(),
  sourceQuality: SourceQualitySchema,
  coverageNotes: z.string().optional(),
  url: z.string().optional(),
});
export type NormalizedCalendarEvent = z.infer<
  typeof NormalizedCalendarEventSchema
>;

export const NormalizedEarningsEventSchema = z.object({
  id: z.string(),
  instrumentId: z.string().optional(),
  ticker: z.string(),
  companyName: z.string().optional(),
  reportDate: z.string(),
  session: z.enum(["bmo", "amc", "during", "unknown"]).default("unknown"),
  fiscalPeriod: z.string().optional(),
  epsActual: z.number().nullable().optional(),
  epsEstimate: z.number().nullable().optional(),
  revenueActual: z.number().nullable().optional(),
  revenueEstimate: z.number().nullable().optional(),
  providerName: z.string(),
  providerTimestamp: z.string(),
  retrievalTimestamp: z.string(),
  sourceQuality: SourceQualitySchema,
  coverageNotes: z.string().optional(),
  url: z.string().optional(),
});
export type NormalizedEarningsEvent = z.infer<
  typeof NormalizedEarningsEventSchema
>;

export const NormalizedFilingSchema = z.object({
  id: z.string(),
  instrumentId: z.string().optional(),
  ticker: z.string().optional(),
  companyName: z.string().optional(),
  formType: z.string(),
  filedAt: z.string(),
  accessionNumber: z.string().optional(),
  title: z.string().optional(),
  url: z.string(),
  providerName: z.string(),
  providerTimestamp: z.string(),
  retrievalTimestamp: z.string(),
  sourceQuality: SourceQualitySchema,
  coverageNotes: z.string().optional(),
});
export type NormalizedFiling = z.infer<typeof NormalizedFilingSchema>;

/** Request / result types */

export const DateRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const TimeSeriesRequestSchema = z.object({
  symbol: z.string(),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d"]).default("1d"),
  range: DateRangeSchema.optional(),
  limit: z.number().int().positive().optional(),
});
export type TimeSeriesRequest = z.infer<typeof TimeSeriesRequestSchema>;

export const BreadthRequestSchema = z.object({
  universe: z.string().default("US"),
  asOf: z.string().optional(),
});
export type BreadthRequest = z.infer<typeof BreadthRequestSchema>;

export const MoversRequestSchema = z.object({
  universe: z.string().default("configured"),
  session: MarketSessionSchema.optional(),
  direction: z.enum(["up", "down", "both"]).default("both"),
  limit: z.number().int().positive().default(25),
});
export type MoversRequest = z.infer<typeof MoversRequestSchema>;

export const NewsSearchRequestSchema = z.object({
  query: z.string().optional(),
  tickers: z.array(z.string()).optional(),
  range: DateRangeSchema.optional(),
  limit: z.number().int().positive().default(50),
});
export type NewsSearchRequest = z.infer<typeof NewsSearchRequestSchema>;

export const MacroSeriesRequestSchema = z.object({
  seriesId: z.string(),
  range: DateRangeSchema.optional(),
  limit: z.number().int().positive().optional(),
});
export type MacroSeriesRequest = z.infer<typeof MacroSeriesRequestSchema>;

export type AiStructuredRequest<T> = {
  task: string;
  systemPrompt?: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  sourceIds?: string[];
  promptVersion?: string;
  /** Optional deterministic fixture for mock/test providers */
  fixture?: unknown;
};

export type AiResult<T> = {
  data: T;
  providerName: string;
  model: string;
  promptVersion?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  latencyMs: number;
};

export const EmailRecipientSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});
export type EmailRecipient = z.infer<typeof EmailRecipientSchema>;

export const ReportEmailRequestSchema = z.object({
  reportId: z.string(),
  edition: ReportEditionSchema,
  tradingDate: z.string(),
  subject: z.string(),
  headlineSummary: z.string().optional(),
  recipients: z.array(EmailRecipientSchema),
  archiveUrl: z.string(),
  pdfPath: z.string().optional(),
  pdfBytesBase64: z.string().optional(),
  status: z.enum(["completed", "partial"]).default("completed"),
  dataCutoff: z.string().optional(),
});
export type ReportEmailRequest = z.infer<typeof ReportEmailRequestSchema>;

export const TransactionalEmailRequestSchema = z.object({
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
  text: z.string().optional(),
  recipients: z.array(EmailRecipientSchema).min(1),
});
export type TransactionalEmailRequest = z.infer<
  typeof TransactionalEmailRequestSchema
>;

export const DeliveryResultSchema = z.object({
  ok: z.boolean(),
  providerName: z.string(),
  messageIds: z.array(z.string()).default([]),
  attempted: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z
    .array(
      z.object({
        recipient: z.string().optional(),
        message: z.string(),
      }),
    )
    .default([]),
});
export type DeliveryResult = z.infer<typeof DeliveryResultSchema>;

export const EnqueueResultSchema = z.object({
  considered: z.number().int().nonnegative(),
  enqueued: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  idempotencyKeys: z.array(z.string()).default([]),
  editions: z.array(ReportEditionSchema).default([]),
  tradingDate: z.string().optional(),
  notes: z.array(z.string()).default([]),
});
export type EnqueueResult = z.infer<typeof EnqueueResultSchema>;
