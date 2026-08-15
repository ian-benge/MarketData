import type { MoveExplanation } from "@/lib/intelligence/types";
import type {
  MembershipConfidence,
  MembershipRole,
  MembershipTier,
  NavGroup,
  ResolutionStatus,
  ScreenKey,
  SectorKind,
  SecurityType,
  WatchlistPurpose,
} from "./taxonomy";

export {
  SECTOR_KINDS,
  WATCHLIST_PURPOSES,
  NAV_GROUPS,
  SECURITY_TYPES,
  type SectorKind,
  type WatchlistPurpose,
  type NavGroup,
  type SecurityType,
  type MembershipRole,
  type MembershipTier,
  type ScreenKey,
  type ResolutionStatus,
} from "./taxonomy";

export const WATCHLIST_VISIBILITIES = ["shared", "personal"] as const;
export type WatchlistVisibility = (typeof WATCHLIST_VISIBILITIES)[number];

export const COVERAGE_FLAGS = [
  "rvol",
  "move",
  "peer",
  "extended",
  "leader",
  "laggard",
  "earnings",
  "stale",
] as const;
export type CoverageFlag = (typeof COVERAGE_FLAGS)[number];

export const COVERAGE_COLUMN_SETS = [
  "tape",
  "performance",
  "identity",
  "full",
] as const;
export type CoverageColumnSet = (typeof COVERAGE_COLUMN_SETS)[number];

export const COVERAGE_GROUP_MODES = [
  "none",
  "role",
  "tier",
  "type",
  "change",
] as const;
export type CoverageGroupMode = (typeof COVERAGE_GROUP_MODES)[number];

export type PersistenceMode = "supabase" | "fixtures" | "unavailable";

export type CoverageItem = {
  ticker: string;
  name: string | null;
  notes: string | null;
  tags: string[];
  sortOrder: number;
  role?: MembershipRole | null;
  tier?: MembershipTier | null;
  rationale?: string | null;
  sourceUrl?: string | null;
  confidence?: MembershipConfidence | null;
  reviewBy?: string | null;
  expiresAt?: string | null;
  securityType?: SecurityType | null;
  leverageMultiple?: number | null;
  isInverse?: boolean;
  isOtc?: boolean;
  resolutionStatus?: ResolutionStatus | null;
  underlyingSymbol?: string | null;
  exchange?: string | null;
};

export type CoverageWatchlist = {
  id: string;
  firmId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  visibility: WatchlistVisibility;
  purpose: WatchlistPurpose;
  navGroup: NavGroup;
  ownerId: string | null;
  archivedAt: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  symbols: string[];
  items: CoverageItem[];
};

export type CoverageSector = {
  id: string;
  firmId: string;
  slug: string;
  name: string;
  description: string | null;
  kind: SectorKind;
  navGroup: NavGroup;
  parentId: string | null;
  benchmarkSymbol: string | null;
  lastReviewedAt: string | null;
  reviewBy: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
  screenKey: ScreenKey | null;
  isSystem: boolean;
  archivedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  symbols: string[];
  items: CoverageItem[];
};

export type CoverageQuote = {
  ticker: string;
  name: string | null;
  last: number | null;
  change1dPercent: number | null;
  changeFromOpenPercent: number | null;
  change1wPercent: number | null;
  change1mPercent: number | null;
  changeYtdPercent: number | null;
  preMarketChangePercent: number | null;
  afterHoursChangePercent: number | null;
  vsSpy1dPercent: number | null;
  vsBenchmark1dPercent: number | null;
  vsGroup1dPercent: number | null;
  relativeVolume: number | null;
  marketCap: number | null;
  volume: number | null;
  avgVolume: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  priorClose: number | null;
  volatility: number | null;
  sectorId: string | null;
  sectorName: string | null;
  notes: string | null;
  tags: string[];
  role: MembershipRole | null;
  tier: MembershipTier | null;
  rationale: string | null;
  securityType: SecurityType;
  leverageMultiple: number | null;
  isInverse: boolean;
  isOtc: boolean;
  resolutionStatus: ResolutionStatus;
  underlyingSymbol: string | null;
  exchange: string | null;
  themeCount: number;
  flags: CoverageFlag[];
  missing: string[];
};

export type CoverageSummary = {
  nameCount: number;
  quotedCount: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  missing: number;
  avg1dPercent: number | null;
  avg1wPercent: number | null;
  avg1mPercent: number | null;
  avgYtdPercent: number | null;
  capWeight1dPercent: number | null;
  vsBenchmark1dPercent: number | null;
  breadth: number | null;
  unusualCount: number;
  quarantinedCount: number;
  dataQuality: "ok" | "partial" | "poor";
  benchmarkSymbol: string | null;
};

export type CoverageMover = {
  ticker: string;
  name: string | null;
  changePercent: number | null;
  relativeVolume: number | null;
  flags: CoverageFlag[];
};

export type SectorBoardRow = {
  id: string;
  name: string;
  slug: string;
  kind: SectorKind;
  navGroup: NavGroup;
  parentId: string | null;
  symbolCount: number;
  quotedCount: number;
  avg1dPercent: number | null;
  avg1wPercent: number | null;
  avg1mPercent: number | null;
  avgYtdPercent: number | null;
  vsSpy1dPercent: number | null;
  vsBenchmark1dPercent: number | null;
  breadth: number | null;
  leaders: string[];
  laggards: string[];
  unusualCount: number;
  screenKey: ScreenKey | null;
  benchmarkSymbol: string | null;
  dataQuality: CoverageSummary["dataQuality"];
};

export type CoverageCatalyst = {
  id: string;
  ticker: string;
  kind: "earnings" | "news";
  title: string;
  at: string | null;
  url: string | null;
};

export type CoverageSelection =
  | { type: "watchlist"; id: string }
  | { type: "sector"; id: string };

export type InstrumentResolutionRow = {
  id: string;
  instrumentId: string;
  symbol: string;
  status: "open" | "suggested" | "dismissed" | "resolved";
  suggestedSymbol: string | null;
  suggestedName: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoverageSnapshot = {
  persistence: PersistenceMode;
  usingFixtures: boolean;
  canEditWatchlists: boolean;
  canEditSectors: boolean;
  isAdmin: boolean;
  viewerId: string;
  asOf: string;
  stale: boolean;
  error: string | null;
  quoteError: string | null;
  latencyCoverageLabel: string | null;
  marketSession: string | null;
  selection: CoverageSelection | null;
  watchlists: CoverageWatchlist[];
  sectors: CoverageSector[];
  quotes: CoverageQuote[];
  rows: CoverageQuote[];
  summary: CoverageSummary;
  winners: CoverageMover[];
  losers: CoverageMover[];
  unusual: CoverageMover[];
  sectorBoard: SectorBoardRow[];
  catalysts: CoverageCatalyst[];
  moveExplanations: MoveExplanation[];
  unresolvedCount: number;
};

export type WatchlistWrite = {
  name: string;
  description?: string | null;
  symbols?: string[];
  visibility?: WatchlistVisibility;
  purpose?: WatchlistPurpose;
  navGroup?: NavGroup;
  isDefault?: boolean;
};

export type WatchlistPatch = {
  name?: string;
  description?: string | null;
  symbols?: string[];
  visibility?: WatchlistVisibility;
  purpose?: WatchlistPurpose;
  isDefault?: boolean;
  archived?: boolean;
  items?: Array<{
    ticker: string;
    notes?: string | null;
    tags?: string[];
    sortOrder?: number;
    role?: MembershipRole | null;
    tier?: MembershipTier | null;
    rationale?: string | null;
  }>;
};

export type SectorWrite = {
  name: string;
  description?: string | null;
  kind?: SectorKind;
  navGroup?: NavGroup;
  benchmarkSymbol?: string | null;
  reviewBy?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  symbols?: string[];
};

export type SectorPatch = {
  name?: string;
  description?: string | null;
  kind?: SectorKind;
  navGroup?: NavGroup;
  benchmarkSymbol?: string | null;
  reviewBy?: string | null;
  expiresAt?: string | null;
  sourceUrl?: string | null;
  symbols?: string[];
  archived?: boolean;
};
