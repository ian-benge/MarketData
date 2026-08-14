export const POSITION_SOURCES = ["manual", "snaptrade"] as const;
export type PositionSource = (typeof POSITION_SOURCES)[number];

export const BROKERAGE_CONNECTION_STATUSES = [
  "connected",
  "disabled",
  "reconnect_required",
] as const;
export type BrokerageConnectionStatus =
  (typeof BROKERAGE_CONNECTION_STATUSES)[number];

export const FEATURED_BROKERS = [
  { slug: "CHARLES_SCHWAB", name: "Charles Schwab" },
  { slug: "ROBINHOOD", name: "Robinhood" },
] as const;

export type FeaturedBroker = (typeof FEATURED_BROKERS)[number];

export type SnapTradeUserCreds = {
  userId: string;
  userSecret: string;
};

export type BrokerageAccountView = {
  id: string;
  name: string;
  numberMasked: string | null;
  bookId: string | null;
  lastSyncAt: string | null;
};

export type BrokerageConnectionView = {
  id: string;
  brokerageSlug: string;
  brokerageName: string;
  status: BrokerageConnectionStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  accounts: BrokerageAccountView[];
};

export type BrokerageSnapshot = {
  configured: boolean;
  connectable: boolean;
  connections: BrokerageConnectionView[];
};

export const EMPTY_BROKERAGE_SNAPSHOT: BrokerageSnapshot = {
  configured: false,
  connectable: false,
  connections: [],
};

export type NormalizedHolding = {
  externalId: string;
  ticker: string;
  assetType: "equity" | "etf" | "option" | "future" | "crypto" | "other";
  side: "long" | "short";
  quantity: number;
  multiplier: number;
  entryPrice: number;
  mark: number | null;
  currency: string;
};

export type HoldingSkip = {
  reason: string;
  ticker?: string;
};

export type SyncedPositionRow = {
  id: string;
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  status: "open" | "closed";
  externalId: string | null;
  brokerageAccountId: string | null;
};

export type NormalizeHoldingsResult = {
  holdings: NormalizedHolding[];
  skipped: HoldingSkip[];
};

export function isSyncedSource(
  source: string | null | undefined,
): source is "snaptrade" {
  return source === "snaptrade";
}
