export const SECTOR_KINDS = [
  "sector",
  "industry",
  "theme",
  "macro",
  "catalyst",
  "screen",
  "benchmark",
  "leveraged_product",
  "custom",
] as const;
export type SectorKind = (typeof SECTOR_KINDS)[number];

export const NAV_GROUPS = [
  "market_tape",
  "official_sectors",
  "ai_compute",
  "energy_materials",
  "industrials_defense",
  "health_consumer",
  "financial_digital",
  "tactical",
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const WATCHLIST_PURPOSES = [
  "tape",
  "leaders",
  "tactical",
  "research",
  "general",
] as const;
export type WatchlistPurpose = (typeof WATCHLIST_PURPOSES)[number];

export const SECURITY_TYPES = [
  "common_stock",
  "adr",
  "etf",
  "etn",
  "index",
  "future",
  "otc",
  "crypto",
  "other",
  "unknown",
] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];

export const RESOLUTION_STATUSES = [
  "resolved",
  "unverified",
  "quarantined",
  "inactive",
] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const MEMBERSHIP_ROLES = [
  "leader",
  "pure_play",
  "supplier",
  "customer",
  "proxy",
  "benchmark",
  "speculative",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_TIERS = ["core", "secondary", "high_beta"] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const MEMBERSHIP_CONFIDENCE = ["high", "medium", "low"] as const;
export type MembershipConfidence = (typeof MEMBERSHIP_CONFIDENCE)[number];

export const SCREEN_KEYS = [
  "premarket_movers",
  "relative_volume",
  "unusual_activity",
  "earnings_today",
  "earnings_week",
  "high_beta_oil",
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

export const KIND_LABELS: Record<SectorKind, string> = {
  sector: "Sector",
  industry: "Industry",
  theme: "Theme",
  macro: "Macro",
  catalyst: "Catalyst",
  screen: "Screen",
  benchmark: "Benchmark",
  leveraged_product: "Leveraged",
  custom: "Basket",
};

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  market_tape: "Market Tape",
  official_sectors: "Official Sectors",
  ai_compute: "AI & Compute",
  energy_materials: "Energy & Materials",
  industrials_defense: "Industrials & Defense",
  health_consumer: "Health & Consumer",
  financial_digital: "Financial & Digital Assets",
  tactical: "Tactical",
};

export const PURPOSE_LABELS: Record<WatchlistPurpose, string> = {
  tape: "Tape",
  leaders: "Leaders",
  tactical: "Tactical",
  research: "Research",
  general: "Watchlist",
};

export const SECURITY_TYPE_LABELS: Record<SecurityType, string> = {
  common_stock: "Common",
  adr: "ADR",
  etf: "ETF",
  etn: "ETN",
  index: "Index",
  future: "Future",
  otc: "OTC",
  crypto: "Crypto",
  other: "Other",
  unknown: "Unresolved",
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  leader: "Leader",
  pure_play: "Pure play",
  supplier: "Supplier",
  customer: "Customer",
  proxy: "Proxy",
  benchmark: "Benchmark",
  speculative: "Speculative",
};

export const TIER_LABELS: Record<MembershipTier, string> = {
  core: "Core",
  secondary: "Secondary",
  high_beta: "High beta",
};

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  premarket_movers: "Premarket Movers",
  relative_volume: "Relative Volume Leaders",
  unusual_activity: "Unusual Activity",
  earnings_today: "Earnings Today",
  earnings_week: "Earnings This Week",
  high_beta_oil: "High-Beta Oil",
};

export function asSectorKind(value: string | null | undefined): SectorKind {
  if (value && (SECTOR_KINDS as readonly string[]).includes(value)) {
    return value as SectorKind;
  }
  return "custom";
}

export function asNavGroup(value: string | null | undefined): NavGroup {
  if (value && (NAV_GROUPS as readonly string[]).includes(value)) {
    return value as NavGroup;
  }
  return "tactical";
}

export function asWatchlistPurpose(
  value: string | null | undefined,
): WatchlistPurpose {
  if (value && (WATCHLIST_PURPOSES as readonly string[]).includes(value)) {
    return value as WatchlistPurpose;
  }
  return "general";
}

export function asSecurityType(value: string | null | undefined): SecurityType {
  if (value && (SECURITY_TYPES as readonly string[]).includes(value)) {
    return value as SecurityType;
  }
  return "unknown";
}

export function asResolutionStatus(
  value: string | null | undefined,
): ResolutionStatus {
  if (value && (RESOLUTION_STATUSES as readonly string[]).includes(value)) {
    return value as ResolutionStatus;
  }
  return "unverified";
}

export function asMembershipRole(
  value: string | null | undefined,
): MembershipRole | null {
  if (value && (MEMBERSHIP_ROLES as readonly string[]).includes(value)) {
    return value as MembershipRole;
  }
  return null;
}

export function asMembershipTier(
  value: string | null | undefined,
): MembershipTier | null {
  if (value && (MEMBERSHIP_TIERS as readonly string[]).includes(value)) {
    return value as MembershipTier;
  }
  return null;
}

export function asMembershipConfidence(
  value: string | null | undefined,
): MembershipConfidence | null {
  if (value && (MEMBERSHIP_CONFIDENCE as readonly string[]).includes(value)) {
    return value as MembershipConfidence;
  }
  return null;
}

export function asScreenKey(value: string | null | undefined): ScreenKey | null {
  if (value && (SCREEN_KEYS as readonly string[]).includes(value)) {
    return value as ScreenKey;
  }
  return null;
}

export function kindLabel(kind: SectorKind): string {
  return KIND_LABELS[kind];
}

export function navGroupLabel(group: NavGroup): string {
  return NAV_GROUP_LABELS[group];
}

export function assetClassFor(type: SecurityType): string {
  if (type === "etf" || type === "etn") return "etf";
  if (type === "crypto") return "crypto";
  if (type === "index") return "index";
  if (type === "future") return "future";
  return "equity";
}

export function isBenchmarkLike(type: SecurityType, role?: MembershipRole | null) {
  return role === "benchmark" || type === "etf" || type === "etn" || type === "index";
}

export function isLeveragedProduct(input: {
  securityType?: SecurityType | null;
  leverageMultiple?: number | null;
  isInverse?: boolean | null;
}): boolean {
  const multiple = input.leverageMultiple ?? 1;
  return Boolean(input.isInverse) || Math.abs(multiple) > 1.01;
}

export function defaultNavGroupForKind(kind: SectorKind): NavGroup {
  if (kind === "sector") return "official_sectors";
  if (kind === "macro" || kind === "benchmark") return "market_tape";
  if (kind === "catalyst" || kind === "screen" || kind === "leveraged_product") {
    return "tactical";
  }
  return "tactical";
}
