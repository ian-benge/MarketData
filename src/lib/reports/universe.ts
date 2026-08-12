/**
 * Coverage taxonomy for institutional tape construction.
 * Rows are only rendered when the ticker exists on the evidence snapshot.
 */

export type TapeGroup =
  | "index"
  | "factor"
  | "rates"
  | "fx"
  | "credit"
  | "commodity"
  | "vol"
  | "crypto"
  | "sector"
  | "ai_infra";

export type AiInfraSleeve =
  | "semis"
  | "equipment"
  | "networking"
  | "hyperscalers"
  | "neoclouds"
  | "power_cooling";

export type TickerMeta = {
  name: string;
  group: TapeGroup;
  sleeve?: AiInfraSleeve;
  heatmap?: boolean;
};

export const TICKER_META: Record<string, TickerMeta> = {
  SPY: { name: "S&P 500", group: "index", heatmap: true },
  QQQ: { name: "Nasdaq 100", group: "index", heatmap: true },
  IWM: { name: "Russell 2000", group: "index", heatmap: true },
  DIA: { name: "Dow Jones", group: "index", heatmap: true },
  TLT: { name: "Long duration", group: "rates", heatmap: true },
  UUP: { name: "U.S. dollar", group: "fx", heatmap: true },
  HYG: { name: "High-yield credit", group: "credit", heatmap: true },
  LQD: { name: "IG credit", group: "credit", heatmap: true },
  GLD: { name: "Gold", group: "commodity", heatmap: true },
  USO: { name: "Crude oil", group: "commodity", heatmap: true },
  VIXY: { name: "Vol proxy", group: "vol", heatmap: true },
  "BTC-USD": { name: "Bitcoin", group: "crypto", heatmap: true },
  IBIT: { name: "Bitcoin (spot ETF)", group: "crypto", heatmap: true },
  XLK: { name: "Technology", group: "sector", heatmap: true },
  XLF: { name: "Financials", group: "sector", heatmap: true },
  XLE: { name: "Energy", group: "sector", heatmap: true },
  XLV: { name: "Health care", group: "sector", heatmap: true },
  XLI: { name: "Industrials", group: "sector", heatmap: true },
  XLY: { name: "Discretionary", group: "sector", heatmap: true },
  XLP: { name: "Staples", group: "sector", heatmap: true },
  XLU: { name: "Utilities", group: "sector", heatmap: true },
  SMH: { name: "Semiconductors", group: "sector", heatmap: true },
  NVDA: { name: "NVIDIA", group: "ai_infra", sleeve: "semis" },
  AMD: { name: "AMD", group: "ai_infra", sleeve: "semis" },
  AVGO: { name: "Broadcom", group: "ai_infra", sleeve: "networking" },
  TSM: { name: "TSMC", group: "ai_infra", sleeve: "semis" },
  AMAT: { name: "Applied Materials", group: "ai_infra", sleeve: "equipment" },
  ASML: { name: "ASML", group: "ai_infra", sleeve: "equipment" },
  MSFT: { name: "Microsoft", group: "ai_infra", sleeve: "hyperscalers" },
  AMZN: { name: "Amazon", group: "ai_infra", sleeve: "hyperscalers" },
  GOOGL: { name: "Alphabet", group: "ai_infra", sleeve: "hyperscalers" },
  META: { name: "Meta", group: "ai_infra", sleeve: "hyperscalers" },
  ORCL: { name: "Oracle", group: "ai_infra", sleeve: "hyperscalers" },
  AAPL: { name: "Apple", group: "ai_infra", sleeve: "hyperscalers" },
  VRT: { name: "Vertiv", group: "ai_infra", sleeve: "power_cooling" },
  CEG: { name: "Constellation", group: "ai_infra", sleeve: "power_cooling" },
  ETN: { name: "Eaton", group: "ai_infra", sleeve: "power_cooling" },
};

export const AI_SLEEVE_LABELS: Record<AiInfraSleeve, string> = {
  semis: "Semiconductors",
  equipment: "WFE / equipment",
  networking: "Networking",
  hyperscalers: "Hyperscalers",
  neoclouds: "Neoclouds",
  power_cooling: "Power / cooling",
};

export const TAPE_GROUP_ORDER: TapeGroup[] = [
  "index",
  "rates",
  "fx",
  "credit",
  "commodity",
  "vol",
  "crypto",
  "sector",
  "ai_infra",
  "factor",
];

export function tickerMeta(ticker: string): TickerMeta | undefined {
  return TICKER_META[ticker.toUpperCase()];
}
