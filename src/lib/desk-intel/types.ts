import type { AttributionKind, ConfidenceLevel, EventType } from "@/lib/intelligence/types";

export const DESK_INTEL_KINDS = [
  "session_brief",
  "move_narrative",
  "book_risk",
  "news_digest",
  "grounded_ask",
  "query_parse",
] as const;
export type DeskIntelKind = (typeof DESK_INTEL_KINDS)[number];

export const GENERATION_METHODS = ["rules", "model"] as const;
export type GenerationMethod = (typeof GENERATION_METHODS)[number];

export const CLAIM_NATURES = ["fact", "inference", "unknown"] as const;
export type ClaimNature = (typeof CLAIM_NATURES)[number];

export const ASK_NATURES = [
  "fact",
  "inference",
  "insufficient_evidence",
] as const;
export type AskNature = (typeof ASK_NATURES)[number];

export type EvidenceSource = {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  publishedAt: string;
  sourceClass: string;
  tickers: string[];
};

export type EvidenceEvent = {
  id: string;
  title: string;
  summary?: string;
  eventType: EventType;
  publishedAt: string;
  materialityScore: number;
  novelty: string;
  tickers: string[];
  themes: string[];
  sourceIds: string[];
  coverageHit: boolean;
};

export type EvidenceMove = {
  ticker: string;
  significant: boolean;
  changePercent: number | null;
  relativeVolume: number | null;
  attribution: AttributionKind;
  confidence: ConfidenceLevel;
  evidenceNature: "fact" | "inference";
  headline: string;
  detail: string;
  sourceIds: string[];
  relatedTickers: string[];
  inBook: boolean;
  onCoverage: boolean;
};

export type EvidenceQuote = {
  ticker: string;
  name?: string | null;
  changePercent: number | null;
  relativeVolume: number | null;
  last?: number | null;
};

export type EvidencePosition = {
  ticker: string;
  side: "long" | "short";
  dayPnl: number | null;
  dayPercent: number | null;
  weight: number | null;
  unrealizedPnl: number | null;
};

export type EvidenceCalendarItem = {
  id: string;
  title: string;
  scheduledAt: string;
  importance?: string | null;
};

export type EvidencePack = {
  asOf: string;
  session: string | null;
  sources: EvidenceSource[];
  allowedTickers: string[];
  inBookTickers: string[];
  coverageTickers: string[];
  events: EvidenceEvent[];
  moves: EvidenceMove[];
  quotes: EvidenceQuote[];
  positions: EvidencePosition[];
  calendar: EvidenceCalendarItem[];
  gaps: string[];
  numberTokens: string[];
  attributionByTicker: Record<string, AttributionKind>;
  identity: unknown;
  ownerLocked?: boolean;
};

export type GroundedClaim = {
  id: string;
  text: string;
  nature: ClaimNature;
  sourceIds: string[];
  tickers: string[];
};

export type SessionBrief = {
  headline: string;
  sessionRead: string;
  materialNow: GroundedClaim[];
  unexplainedTape: Array<{
    ticker: string;
    changePercent: number | null;
    note: string;
  }>;
  bookFlags: Array<{
    ticker: string;
    note: string;
    sourceIds: string[];
  }>;
  themes: Array<{
    id: string;
    note: string;
    sourceIds: string[];
  }>;
  watchItems: string[];
  gaps: string[];
  unresolvedQuestions: string[];
};

export type MoveNarrative = {
  ticker: string;
  attribution: AttributionKind;
  nature: ClaimNature;
  headline: string;
  narrative: string;
  whyItMatters: string;
  caveats: string[];
  sourceIds: string[];
  relatedTickers: string[];
};

export type BookRiskItem = {
  ticker: string;
  severity: "high" | "medium" | "low";
  kind: "unexplained_move" | "catalyst" | "concentration" | "gap";
  note: string;
  sourceIds: string[];
  changePercent?: number | null;
  dayPnl?: number | null;
};

export type BookRisk = {
  headline: string;
  items: BookRiskItem[];
  gaps: string[];
  ownerLocked?: boolean;
};

export type NewsDigest = {
  headline: string;
  bullets: GroundedClaim[];
  clusters: Array<{
    title: string;
    eventIds: string[];
    note: string;
    sourceIds: string[];
  }>;
  unresolvedQuestions: string[];
};

export type AskAnswer = {
  answer: string;
  nature: AskNature;
  claims: GroundedClaim[];
  sourceIds: string[];
  followUps: string[];
};

export type QueryInterpret = {
  intent: "search" | "why_moving" | "ask";
  tickers: string[];
  eventTypes: string[];
  themes: string[];
  materialOnly: boolean;
  timeWindow: string | null;
  textTerms: string[];
  whyTicker: string | null;
};

export type DeskIntelWarning = {
  code: string;
  message: string;
};

export type DeskIntelEnvelope<T> = {
  kind: DeskIntelKind;
  subject: string;
  method: GenerationMethod;
  model: string | null;
  providerName: string | null;
  promptVersion: string;
  evidenceHash: string;
  generatedAt: string;
  cached: boolean;
  warnings: DeskIntelWarning[];
  sources: EvidenceSource[];
  data: T;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export const UNKNOWN_MOVE_COPY =
  "No verified catalyst is in the current evidence window. That is not a claim that no catalyst exists.";
