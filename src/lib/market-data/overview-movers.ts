import { detectMaterialMovers } from "@/lib/domain/material-movers";
import {
  MAJOR_INDEX_ETFS,
  SECTOR_ETFS,
} from "@/lib/market-data/universe";
import {
  CROSS_ASSET_TAPE_SYMBOLS,
  DURATION_PROXY_ETFS,
  marketPulseProxyEtfs,
} from "@/lib/market-data/market-pulse";
import type {
  CausalStatus,
  MarketSession,
  NormalizedMover,
  NormalizedNewsItem,
} from "@/lib/providers/types";

const ETF_SET = new Set<string>([
  ...MAJOR_INDEX_ETFS,
  ...SECTOR_ETFS,
  ...marketPulseProxyEtfs(),
  ...CROSS_ASSET_TAPE_SYMBOLS,
  ...DURATION_PROXY_ETFS,
]);

export type JoinedMover = {
  ticker: string;
  name?: string;
  last: number;
  changePercent: number;
  volume: number | null;
  relativeVolume: number | null;
  direction: "up" | "down";
  causalStatus: Extract<CausalStatus, "reported" | "unclear">;
  headlineTitle: string | null;
  headlineId: string | null;
  coverageNotes: string | null;
};

function priorCloseFromMover(mover: NormalizedMover): number | null {
  if (mover.last == null || !Number.isFinite(mover.last)) return null;
  if (mover.changeAbsolute != null && Number.isFinite(mover.changeAbsolute)) {
    return mover.last - mover.changeAbsolute;
  }
  if (mover.changePercent == null || !Number.isFinite(mover.changePercent)) {
    return null;
  }
  const denom = 1 + mover.changePercent / 100;
  if (denom === 0) return null;
  return mover.last / denom;
}

function headlineForTicker(
  ticker: string,
  headlines: NormalizedNewsItem[],
): NormalizedNewsItem | undefined {
  const upper = ticker.toUpperCase();
  return headlines.find((item) =>
    item.tickers.some((tag) => tag.toUpperCase() === upper),
  );
}

/**
 * Snapshot movers already survived the movers pipeline. Re-run materiality
 * (not a raw % sort of the full tape) and join headlines by ticker.
 * Causal status copies report rules: reported if a headline ticker matches.
 */
export function joinMaterialMovers(
  movers: NormalizedMover[],
  headlines: NormalizedNewsItem[],
  session: MarketSession | string | null | undefined,
  coverageNotes?: string | null,
): JoinedMover[] {
  const marketSession: MarketSession =
    session === "premarket" ||
    session === "regular" ||
    session === "afterhours" ||
    session === "closed"
      ? session
      : "unknown";

  const candidates = detectMaterialMovers(
    movers.map((mover) => ({
      ticker: mover.ticker,
      company: mover.name,
      price: mover.last,
      priorClose: priorCloseFromMover(mover),
      changePercent: mover.changePercent,
      changeAbsolute: mover.changeAbsolute,
      volume: mover.volume ?? null,
      averageVolume: null,
      marketCapCategory: mover.marketCapCategory ?? "mega",
      session: mover.marketSession ?? marketSession,
      asOf: mover.providerTimestamp,
      isEtf: ETF_SET.has(mover.ticker.toUpperCase()),
      monitorEtf: ETF_SET.has(mover.ticker.toUpperCase()),
    })),
  );

  return candidates.map((candidate) => {
    const source = movers.find(
      (mover) => mover.ticker.toUpperCase() === candidate.ticker,
    );
    const headline = headlineForTicker(candidate.ticker, headlines);
    return {
      ticker: candidate.ticker,
      name: source?.name ?? candidate.company,
      last: candidate.price,
      changePercent: candidate.percentMove,
      volume: candidate.volume,
      relativeVolume: candidate.relativeVolume ?? source?.relativeVolume ?? null,
      direction: candidate.percentMove >= 0 ? "up" : "down",
      causalStatus: headline ? "reported" : "unclear",
      headlineTitle: headline?.title ?? null,
      headlineId: headline?.id ?? null,
      coverageNotes: source?.coverageNotes ?? coverageNotes ?? null,
    };
  });
}
