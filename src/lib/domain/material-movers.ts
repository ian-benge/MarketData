import type { CausalStatus, MarketSession } from "@/lib/providers/types";

export type MarketCapCategory = "mega" | "large" | "mid" | "small" | "micro";

export type MaterialMoverInput = {
  ticker: string;
  company?: string;
  price: number | null;
  priorClose: number | null;
  changePercent?: number | null;
  changeAbsolute?: number | null;
  volume?: number | null;
  averageVolume?: number | null;
  marketCapCategory?: MarketCapCategory | "unknown";
  session: MarketSession;
  asOf: string;
  isWatchlist?: boolean;
  isEtf?: boolean;
  monitorEtf?: boolean;
  shareClassDuplicate?: boolean;
  bid?: number | null;
  ask?: number | null;
};

export type MaterialityThresholds = {
  /** Minimum absolute percent move by market-cap category (regular session). */
  byMarketCap: Record<MarketCapCategory, number>;
  /** Multiplier applied for premarket/afterhours (e.g. 1.5 = 50% higher bar). */
  extendedHoursMultiplier: number;
  /** Watchlist names get this multiplicative reduction on the threshold. */
  watchlistBoostFactor: number;
  /** Minimum dollar price to avoid penny-noise. */
  minPrice: number;
  /** Minimum volume; null disables. */
  minVolume: number | null;
  /** Relative volume (volume / averageVolume) floor when average known. */
  minRelativeVolume: number | null;
  /** Max bid-ask spread as fraction of mid to accept a print. */
  maxSpreadFraction: number;
  /** Suppress non-monitored ETFs. */
  suppressUnmonitoredEtfs: boolean;
};

export const DEFAULT_MATERIALITY_THRESHOLDS: MaterialityThresholds = {
  byMarketCap: {
    mega: 1.5,
    large: 2.0,
    mid: 3.0,
    small: 5.0,
    micro: 8.0,
  },
  extendedHoursMultiplier: 1.5,
  watchlistBoostFactor: 0.7,
  minPrice: 1,
  minVolume: 50_000,
  minRelativeVolume: 0.5,
  maxSpreadFraction: 0.05,
  suppressUnmonitoredEtfs: true,
};

export type MaterialMoverCandidate = {
  ticker: string;
  company?: string;
  price: number;
  percentMove: number;
  absoluteMove: number;
  session: MarketSession;
  asOf: string;
  volume: number | null;
  relativeVolume: number | null;
  marketCapCategory: MarketCapCategory | "unknown";
  isWatchlist: boolean;
  thresholdUsed: number;
  causalStatus: CausalStatus;
  confidenceScore: number;
  confidenceReason: string;
  catalystSummary: string;
  sourceIds: string[];
};

function resolveCategory(
  category: MaterialMoverInput["marketCapCategory"],
): MarketCapCategory | "unknown" {
  if (!category || category === "unknown") return "unknown";
  return category;
}

function thresholdFor(
  input: MaterialMoverInput,
  thresholds: MaterialityThresholds,
): number {
  const category = resolveCategory(input.marketCapCategory);
  const base =
    category === "unknown"
      ? thresholds.byMarketCap.mid
      : thresholds.byMarketCap[category];

  let required = base;
  if (input.session === "premarket" || input.session === "afterhours") {
    required *= thresholds.extendedHoursMultiplier;
  }
  if (input.isWatchlist) {
    required *= thresholds.watchlistBoostFactor;
  }
  return required;
}

function isBadTick(
  input: MaterialMoverInput,
  thresholds: MaterialityThresholds,
): string | null {
  if (input.price == null || !Number.isFinite(input.price)) {
    return "missing or non-finite price";
  }
  if (input.price < thresholds.minPrice) {
    return "price below minimum";
  }
  if (input.priorClose == null || !Number.isFinite(input.priorClose)) {
    return "missing prior close";
  }
  if (input.priorClose <= 0) {
    return "non-positive prior close";
  }
  if (input.shareClassDuplicate) {
    return "duplicate share class";
  }
  if (
    thresholds.suppressUnmonitoredEtfs &&
    input.isEtf &&
    !input.monitorEtf &&
    !input.isWatchlist
  ) {
    return "unmonitored ETF";
  }
  if (
    thresholds.minVolume != null &&
    input.volume != null &&
    input.volume < thresholds.minVolume
  ) {
    return "illiquid volume";
  }
  if (
    thresholds.minRelativeVolume != null &&
    input.volume != null &&
    input.averageVolume != null &&
    input.averageVolume > 0
  ) {
    const rvol = input.volume / input.averageVolume;
    if (rvol < thresholds.minRelativeVolume) {
      return "low relative volume";
    }
  }
  if (
    input.bid != null &&
    input.ask != null &&
    input.bid > 0 &&
    input.ask >= input.bid
  ) {
    const mid = (input.bid + input.ask) / 2;
    if (mid > 0) {
      const spread = (input.ask - input.bid) / mid;
      if (spread > thresholds.maxSpreadFraction) {
        return "wide bid-ask spread (likely bad tick)";
      }
    }
  }
  // Obvious bad tick: >40% move without supporting volume
  const pct =
    input.changePercent ??
    ((input.price - input.priorClose) / input.priorClose) * 100;
  if (
    Math.abs(pct) > 40 &&
    (input.volume == null ||
      input.averageVolume == null ||
      input.volume < (input.averageVolume ?? 0) * 0.2)
  ) {
    return "extreme move without volume support";
  }
  return null;
}

/**
 * Filters and ranks material movers from a raw quote/move set.
 */
export function detectMaterialMovers(
  inputs: MaterialMoverInput[],
  thresholds: MaterialityThresholds = DEFAULT_MATERIALITY_THRESHOLDS,
): MaterialMoverCandidate[] {
  const out: MaterialMoverCandidate[] = [];

  for (const input of inputs) {
    const rejectReason = isBadTick(input, thresholds);
    if (rejectReason) continue;

    const price = input.price as number;
    const prior = input.priorClose as number;
    const percentMove =
      input.changePercent ?? ((price - prior) / prior) * 100;
    const absoluteMove = input.changeAbsolute ?? price - prior;

    if (!Number.isFinite(percentMove) || !Number.isFinite(absoluteMove)) {
      continue;
    }

    const required = thresholdFor(input, thresholds);
    if (Math.abs(percentMove) < required) continue;

    const relativeVolume =
      input.volume != null &&
      input.averageVolume != null &&
      input.averageVolume > 0
        ? input.volume / input.averageVolume
        : null;

    out.push({
      ticker: input.ticker.toUpperCase(),
      company: input.company,
      price,
      percentMove,
      absoluteMove,
      session: input.session,
      asOf: input.asOf,
      volume: input.volume ?? null,
      relativeVolume,
      marketCapCategory: resolveCategory(input.marketCapCategory),
      isWatchlist: Boolean(input.isWatchlist),
      thresholdUsed: required,
      causalStatus: "unclear",
      confidenceScore: 0,
      confidenceReason: "No catalyst attached yet",
      catalystSummary: "No confirmed catalyst found",
      sourceIds: [],
    });
  }

  return out.sort((a, b) => Math.abs(b.percentMove) - Math.abs(a.percentMove));
}
