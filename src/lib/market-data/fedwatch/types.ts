/** Client poll + live quote rebuild. History/target stay on longer caches. */
export const FEDWATCH_REFRESH_MS = 15_000;
export const FEDWATCH_HISTORY_MS = 15 * 60 * 1000;
export const FEDWATCH_TARGET_MS = 60 * 60 * 1000;

export type FedWatchSource =
  | "cme_official"
  | "zq_delayed"
  | "cme_settlement"
  | "unavailable";

export type FedWatchMoveKind = "ease" | "hold" | "hike";

export type FedWatchBin = {
  lowerBps: number;
  upperBps: number;
  label: string;
  probability: number;
  kind: FedWatchMoveKind;
};

export type FedWatchLookbackId = "now" | "1d" | "1w" | "1m";

export type FedWatchLookback = {
  id: FedWatchLookbackId;
  label: string;
  date: string | null;
  bins: FedWatchBin[];
  ease: number;
  hold: number;
  hike: number;
};

export type FedWatchCompareRow = {
  lowerBps: number;
  upperBps: number;
  label: string;
  current: boolean;
  values: Partial<Record<FedWatchLookbackId, number>>;
};

export type FedWatchMeeting = {
  date: string;
  label: string;
  tabLabel: string;
  contract: string;
  expires: string;
  price: number | null;
  impliedRate: number | null;
  volume: number | null;
  openInterest: number | null;
  bins: FedWatchBin[];
  ease: number;
  hold: number;
  hike: number;
  lookbacks?: FedWatchLookback[];
  compareRows?: FedWatchCompareRow[];
};

export type FedWatchTarget = {
  lowerPct: number;
  upperPct: number;
  lowerBps: number;
  upperBps: number;
  label: string;
};

export type FedWatchSnapshot = {
  asOf: string;
  quoteAsOf?: string | null;
  source: FedWatchSource;
  sourceLabel: string;
  attribution: string;
  delayed: boolean;
  stale: boolean;
  refreshSeconds: number;
  currentTarget: FedWatchTarget | null;
  effr: { value: number; asOf: string } | null;
  meetings: FedWatchMeeting[];
  error: string | null;
};

export type FedFundsQuote = {
  monthKey: string;
  year: number;
  month: number;
  price: number;
  volume: number | null;
  openInterest: number | null;
  tradedAt?: string | null;
};

export type TargetContext = {
  effr: number | null;
  effrAsOf: string | null;
  lowerPct: number;
  upperPct: number;
};
