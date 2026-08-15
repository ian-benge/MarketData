import type {
  CausalStatus,
  NormalizedNewsItem,
} from "@/lib/providers/types";

export const EVENT_TYPES = [
  "earnings",
  "guidance",
  "filing",
  "ir",
  "management",
  "ma",
  "financing",
  "offering",
  "buyback",
  "dividend",
  "analyst",
  "contract",
  "regulatory",
  "litigation",
  "investigation",
  "product",
  "customer",
  "partnership",
  "supply_chain",
  "outage",
  "cyber",
  "commodity",
  "economic",
  "central_bank",
  "rates",
  "geopolitics",
  "trade",
  "tariff",
  "export_control",
  "sector",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const NOVELTY_STATES = ["new", "update", "duplicate", "recycled"] as const;
export type NoveltyState = (typeof NOVELTY_STATES)[number];

export const SENTIMENT_STATES = [
  "positive",
  "negative",
  "mixed",
  "neutral",
  "unscored",
] as const;
export type SentimentState = (typeof SENTIMENT_STATES)[number];

export const ATTRIBUTION_KINDS = [
  "confirmed_company",
  "likely_catalyst",
  "sympathy",
  "multiple",
  "unknown",
] as const;
export type AttributionKind = (typeof ATTRIBUTION_KINDS)[number];

export const CONFIDENCE_LEVELS = [
  "confirmed",
  "probable",
  "speculative",
  "unknown",
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ENTITY_ROLES = ["primary", "related", "second_order"] as const;
export type EntityRole = (typeof ENTITY_ROLES)[number];

export const ENTITY_METHODS = [
  "provider",
  "ticker_token",
  "company_name",
  "alias",
  "theme_peer",
  "ambiguous",
] as const;
export type EntityMethod = (typeof ENTITY_METHODS)[number];

export type ResolvedEntity = {
  ticker: string;
  name: string | null;
  role: EntityRole;
  confidence: "high" | "medium" | "low";
  method: EntityMethod;
};

export type IntelligenceHeadline = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  canonicalUrl?: string;
  publisher?: string;
  publishedAt: string;
  sourceClass: NormalizedNewsItem["sourceClass"];
  providerName: string;
  sourceQuality: NormalizedNewsItem["sourceQuality"];
};

export type MarketReaction = {
  ticker: string;
  changePercent: number | null;
  relativeVolume: number | null;
};

export type IntelligenceEvent = {
  id: string;
  clusterId: string;
  title: string;
  summary?: string;
  eventType: EventType;
  eventTypeLabel: string;
  publishedAt: string;
  novelty: NoveltyState;
  materialityScore: number;
  sentiment: SentimentState;
  sentimentNote: string | null;
  confidence: ConfidenceLevel;
  tickers: ResolvedEntity[];
  themes: string[];
  sectors: string[];
  secondOrder: ResolvedEntity[];
  sources: IntelligenceHeadline[];
  representative: IntelligenceHeadline;
  memberCount: number;
  coverageNotes: string | null;
  marketReaction: MarketReaction[];
};

export type MoveWindow = {
  start: string;
  end: string;
  label: string;
};

export type MoveExplanation = {
  ticker: string;
  significant: boolean;
  changePercent: number | null;
  relativeVolume: number | null;
  session: string | null;
  flags: string[];
  direction: "up" | "down" | "flat";
  attribution: AttributionKind;
  confidence: ConfidenceLevel;
  evidenceNature: "fact" | "inference";
  causalStatus: CausalStatus;
  headline: string;
  detail: string;
  supportingEvents: Array<{
    id: string;
    title: string;
    publishedAt: string;
    url: string;
    publisher?: string;
    eventType: EventType;
  }>;
  relatedTickers: string[];
  themes: string[];
  window: MoveWindow;
  coverageGap: string | null;
};

export type CoverageGap = {
  code: string;
  message: string;
};

export type SourceStatus = {
  id: string;
  label: string;
  status: "ok" | "empty" | "error" | "unavailable";
  note: string;
  itemCount: number;
};

export type ParsedNewsQuery = {
  raw: string;
  intent: "search" | "why_moving";
  textTerms: string[];
  tickers: string[];
  eventTypes: EventType[];
  themes: string[];
  sources: string[];
  timeRange: MoveWindow | null;
  materialOnly: boolean;
  whyTicker: string | null;
};

export type NewsSearchFilters = {
  query?: string;
  tickers?: string[];
  eventTypes?: EventType[];
  themes?: string[];
  sources?: string[];
  novelty?: NoveltyState[];
  materialOnly?: boolean;
  since?: string;
  until?: string;
  limit?: number;
};

export type IntelligenceBundle = {
  events: IntelligenceEvent[];
  headlines: NormalizedNewsItem[];
  moves: MoveExplanation[];
  gaps: CoverageGap[];
  sources: SourceStatus[];
  fetchedAt: string;
  stale: boolean;
};

export type QuoteContext = {
  ticker: string;
  name?: string | null;
  changePercent: number | null;
  relativeVolume: number | null;
  preMarketChangePercent?: number | null;
  afterHoursChangePercent?: number | null;
  vsGroupPercent?: number | null;
  flags: string[];
  session?: string | null;
};

export type CoverageLink = {
  ticker: string;
  sectorNames: string[];
  themeNames: string[];
  collectionNames: string[];
};

export type PriorHeadline = {
  title: string;
  publishedAt: string;
  contentHash?: string;
  tickers: string[];
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  earnings: "Earnings",
  guidance: "Guidance",
  filing: "Filing",
  ir: "Investor relations",
  management: "Management",
  ma: "M&A",
  financing: "Financing",
  offering: "Offering",
  buyback: "Buyback",
  dividend: "Dividend",
  analyst: "Analyst",
  contract: "Contract",
  regulatory: "Regulatory",
  litigation: "Litigation",
  investigation: "Investigation",
  product: "Product",
  customer: "Customer",
  partnership: "Partnership",
  supply_chain: "Supply chain",
  outage: "Outage",
  cyber: "Cybersecurity",
  commodity: "Commodity",
  economic: "Economic data",
  central_bank: "Central bank",
  rates: "Rates",
  geopolitics: "Geopolitics",
  trade: "Trade policy",
  tariff: "Tariff",
  export_control: "Export control",
  sector: "Sector",
  other: "Other",
};

export const ATTRIBUTION_LABELS: Record<AttributionKind, string> = {
  confirmed_company: "Confirmed company catalyst",
  likely_catalyst: "Likely catalyst",
  sympathy: "Sympathy / related market",
  multiple: "Multiple possible catalysts",
  unknown: "No verified catalyst",
};

export const ATTRIBUTION_COMPACT_LABELS: Record<AttributionKind, string> = {
  confirmed_company: "Confirmed",
  likely_catalyst: "Likely",
  sympathy: "Sympathy",
  multiple: "Multiple",
  unknown: "Unknown",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  confirmed: "Confirmed",
  probable: "Probable",
  speculative: "Speculative",
  unknown: "Unknown",
};

export const NOVELTY_LABELS: Record<NoveltyState, string> = {
  new: "New",
  update: "Update",
  duplicate: "Duplicate",
  recycled: "Recycled",
};
