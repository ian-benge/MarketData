export type DashboardWatchlistRow = {
  ticker: string;
  name: string | null;
  last: number | null;
  change1dPercent: number | null;
  changeFromOpenPercent: number | null;
  change1wPercent: number | null;
  relativeVolume: number | null;
  marketCap: number | null;
  volume: number | null;
  missing: string[];
};

export type DashboardWatchlistList = {
  id: string;
  name: string;
  isDefault: boolean;
  symbolCount: number;
};

export type DashboardWatchlistSnapshot = {
  listId: string;
  listName: string;
  symbols: string[];
  rows: DashboardWatchlistRow[];
  lists: DashboardWatchlistList[];
  asOf: string;
  stale: boolean;
  usingFixtures: boolean;
  error: string | null;
};

export type WatchlistQuoteInput = {
  ticker: string;
  last: number | null;
  open?: number | null;
  changePercent?: number | null;
  volume?: number | null;
};

export type WatchlistEnrichment = {
  name?: string | null;
  marketCap?: number | null;
  avgVolume?: number | null;
  weekAgoClose?: number | null;
};
