import type { BrokerageSnapshot } from "@/lib/brokerage/types";

export const POSITION_ASSET_TYPES = [
  "equity",
  "etf",
  "option",
  "future",
  "crypto",
  "other",
] as const;

export type PositionAssetType = (typeof POSITION_ASSET_TYPES)[number];

export const POSITION_SIDES = ["long", "short"] as const;
export type PositionSide = (typeof POSITION_SIDES)[number];

export const POSITION_STATUSES = ["open", "closed"] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export type PositionRecord = {
  id: string;
  firmId: string;
  ticker: string;
  assetType: PositionAssetType;
  side: PositionSide;
  quantity: number;
  multiplier: number;
  entryPrice: number;
  entryDate: string;
  currency: string;
  strategy: string | null;
  notes: string | null;
  status: PositionStatus;
  closePrice: number | null;
  closeDate: string | null;
  closedAt: string | null;
  createdBy: string | null;
  bookId: string | null;
  source?: "manual" | "snaptrade";
  brokerageAccountId?: string | null;
  externalId?: string | null;
  brokerageName?: string | null;
  fees?: number;
  createdAt: string;
  updatedAt: string;
};

export type CloseLotInput = {
  closePrice: number;
  closeDate: string;
  quantity?: number | null;
};

export type PositionQuote = {
  ticker: string;
  last: number | null;
  priorClose: number | null;
  open: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  currency: string;
  stale: boolean;
};

export type DailyClose = {
  date: string;
  close: number;
};

export type PeriodMetrics = {
  price: number | null;
  pnl: number | null;
  percent: number | null;
};

export type EnrichedPosition = PositionRecord & {
  last: number | null;
  priorClose: number | null;
  mark: number | null;
  currency: string;
  costBasis: number;
  marketValue: number | null;
  signedMarketValue: number | null;
  weight: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  totalPnl: number | null;
  returnPercent: number | null;
  dayPnl: number | null;
  dayPercent: number | null;
  change1d: PeriodMetrics;
  change1w: PeriodMetrics;
  change1m: PeriodMetrics;
  sinceEntry: PeriodMetrics;
  holdingDays: number | null;
  quoteStale: boolean;
  missing: string[];
  sparkline: number[];
  relatedRealizedPnl: number | null;
  relatedRealizedPercent: number | null;
  fees: number;
  grossRealizedPnl: number | null;
};

export type NamedContributor = {
  id: string;
  ticker: string;
  side: PositionSide;
  pnl: number;
  percent: number | null;
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  weight: number | null;
};

export type PositionActivityKind = "entry" | "exit";

export type PositionActivityEvent = {
  id: string;
  positionId: string;
  kind: PositionActivityKind;
  date: string;
  ticker: string;
  side: PositionSide;
  quantity: number;
  multiplier: number;
  price: number | null;
  strategy: string | null;
  pnl: number | null;
  returnPercent: number | null;
  holdingDays: number | null;
};

export type PortfolioEventKind = "opened" | "closed";

export type PortfolioEvent = {
  kind: PortfolioEventKind;
  id: string;
  ticker: string;
  side: PositionSide;
};

export type PortfolioPoint = {
  date: string;
  dayPnl: number | null;
  cumulativePnl: number | null;
  openCount: number;
  events: PortfolioEvent[];
  carried: PortfolioEvent[];
  leader: { ticker: string; pnl: number } | null;
};

export type PortfolioSummary = {
  openCount: number;
  closedCount: number;
  longCount: number;
  shortCount: number;
  quotedCount: number;
  grossExposure: number | null;
  netExposure: number | null;
  longExposure: number | null;
  shortExposure: number | null;
  netExposurePercent: number | null;
  longShortRatio: number | null;
  accountValue: number | null;
  cash: number | null;
  investedValue: number | null;
  portfolioValue: number | null;
  /**
   * Heuristic Reg-T multiples. Always null until a broker-sourced field exists.
   * Kept on the type so older clients do not break; the UI must not display them.
   */
  intradayBuyingPower: number | null;
  overnightBuyingPower: number | null;
  optionBuyingPower: number | null;
  /** Closed-lot net P&L with closeDate equal to Chicago as-of date. */
  realizedTodayPnl: number | null;
  hitRateSampleSize: number;
  costBasis: number | null;
  closedCostBasis: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  realizedReturnPercent: number | null;
  closedHitRate: number | null;
  closedAverageHoldingDays: number | null;
  closedAllOptions: boolean;
  totalPnl: number | null;
  /** Unrealized + gross realized, before commissions and account fees. */
  pnlBeforeFees: number | null;
  fees: number | null;
  grossRealizedPnl: number | null;
  bookReturnPercent: number | null;
  dayPnl: number | null;
  dayPercent: number | null;
  change1wPnl: number | null;
  change1mPnl: number | null;
  largestWeight: number | null;
  herfindahl: number | null;
  hitRate: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  averageHoldingDays: number | null;
  winners: NamedContributor[];
  losers: NamedContributor[];
  bySide: AllocationSlice[];
  byAssetType: AllocationSlice[];
  byStrategy: AllocationSlice[];
};

export type PositionBookOwner = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "member" | "unassigned";
  openCount: number;
  isViewer: boolean;
  needsUnlock?: boolean;
};

export type PositionBook = {
  id: string;
  ownerId: string;
  title: string;
  accountValue: number | null;
  openCount: number;
  positionCount: number;
  source?: "manual" | "snaptrade";
  brokerageName?: string | null;
  connectionStatus?: "connected" | "disabled" | "reconnect_required" | null;
  lastSyncAt?: string | null;
  fees?: number;
  sortOrder?: number;
};

export type PositionsSnapshot = {
  asOf: string;
  stale: boolean;
  usingFixtures: boolean;
  persistence: "supabase" | "fixtures" | "unavailable";
  latencyCoverageLabel: string;
  feedCoverage: string;
  latencyClass: string;
  marketSession: string | null;
  licenseWarning: string | null;
  quotesRequested: number;
  quotesCovered: number;
  accountValue: number | null;
  summary: PortfolioSummary;
  positions: EnrichedPosition[];
  series: PortfolioPoint[];
  history: Record<string, DailyClose[]>;
  owners: PositionBookOwner[];
  ownerId: string;
  books: PositionBook[];
  bookId: string;
  viewerId: string;
  /** Desk email for open/close alerts on this owner's books. Default true. */
  tradeEmails: boolean;
  canEdit: boolean;
  /** True when the viewer must enter this owner's password to see account value, P&L, and closed lots. */
  ownerLocked: boolean;
  /** How the book NAV was sourced. Cash fallback is labeled separately from broker equity. */
  accountValueKind?: "broker" | "broker_cash" | "manual" | null;
  /** False when this payload omitted closed lot rows (summary still includes closed aggregates). */
  closedIncluded?: boolean;
  brokerage?: BrokerageSnapshot;
  error: string | null;
};
