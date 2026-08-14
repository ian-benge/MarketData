/**
 * Shared tape / heatmap / factor / variant math used by research reports
 * and Market Overview. Do not fork formulas — reports must keep identical numbers.
 */

import { SECTOR_ETFS } from "@/lib/market-data/universe";
import {
  TAPE_GROUP_ORDER,
  tickerMeta,
  type TapeGroup,
} from "@/lib/reports/universe";

export type QuoteLike = {
  ticker: string;
  last?: number | null;
  changePercent?: number | null;
};

export type TapeRow = {
  key: string;
  label: string;
  group: TapeGroup;
  ticker?: string;
  sleeve?: import("@/lib/reports/universe").AiInfraSleeve;
  last: number | null;
  changePercent: number | null;
  vsSpyPct: number | null;
  available: boolean;
};

export type HeatmapCell = {
  key: string;
  label: string;
  changePercent: number | null;
  available: boolean;
};

export const OVERVIEW_TAPE_TICKERS = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "TLT",
  "UUP",
  "HYG",
  "LQD",
  "GLD",
  "USO",
  "VIXY",
  "BTC-USD",
  "IBIT",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "SMH",
] as const;

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function formatSignedPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function quoteMap(quotes: QuoteLike[]): Map<string, QuoteLike> {
  return new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
}

export function rowFromQuote(
  ticker: string,
  quotes: Map<string, QuoteLike>,
  spyChange: number | null,
  groupOverride?: TapeGroup,
): TapeRow {
  const meta = tickerMeta(ticker);
  const q = quotes.get(ticker.toUpperCase());
  const change = q?.changePercent ?? null;
  const vsSpy =
    ticker.toUpperCase() === "SPY" || change == null || spyChange == null
      ? null
      : round4(change - spyChange);
  return {
    key: ticker,
    label: meta?.name ?? ticker,
    group: groupOverride ?? meta?.group ?? "index",
    ticker,
    sleeve: meta?.sleeve,
    last: q?.last ?? null,
    changePercent: change,
    vsSpyPct: vsSpy,
    available: Boolean(q),
  };
}

export function factorRow(
  key: string,
  label: string,
  left: QuoteLike | undefined,
  right: QuoteLike | undefined,
): TapeRow {
  const available =
    left?.changePercent != null && right?.changePercent != null;
  const change =
    available && left && right
      ? round4((left.changePercent ?? 0) - (right.changePercent ?? 0))
      : null;
  return {
    key,
    label,
    group: "factor",
    last: null,
    changePercent: change,
    vsSpyPct: change,
    available,
  };
}

export type SharedMarketAnalytics = {
  spyChange: number | null;
  tape: TapeRow[];
  heatmap: HeatmapCell[];
  relativeBars: TapeRow[];
  variantViews: string[];
  quotes: Map<string, QuoteLike>;
};

export function buildSharedMarketAnalytics(input: {
  quotes: QuoteLike[];
  breadth?: {
    advancing: number | null;
    declining: number | null;
    newHighs?: number | null;
    newLows?: number | null;
  };
}): SharedMarketAnalytics {
  const quotes = quoteMap(input.quotes);
  const spy = quotes.get("SPY");
  const spyChange = spy?.changePercent ?? null;
  const qqq = quotes.get("QQQ");
  const iwm = quotes.get("IWM");
  const tlt = quotes.get("TLT");
  const vixy = quotes.get("VIXY");

  const tape: TapeRow[] = [
    ...OVERVIEW_TAPE_TICKERS.map((t) => rowFromQuote(t, quotes, spyChange)),
    factorRow("factor-growth", "QQQ minus SPY (growth/tech)", qqq, spy),
    factorRow("factor-size", "IWM minus SPY (size)", iwm, spy),
  ].filter((row) => row.available || row.group === "factor");

  const heatmap: HeatmapCell[] = tape
    .filter((row) => row.ticker && tickerMeta(row.ticker)?.heatmap)
    .map((row) => ({
      key: row.key,
      label: row.label,
      changePercent: row.changePercent,
      available: row.available,
    }));

  const relativeBars = [...tape]
    .filter((row) => row.vsSpyPct != null && row.ticker && row.ticker !== "SPY")
    .sort((a, b) => Math.abs(b.vsSpyPct ?? 0) - Math.abs(a.vsSpyPct ?? 0))
    .slice(0, 10);

  const adv = input.breadth?.advancing ?? null;
  const dec = input.breadth?.declining ?? null;

  const variantViews: string[] = [];
  if (qqq?.changePercent != null && spyChange != null) {
    const spread = round4(qqq.changePercent - spyChange);
    if (spread > 0.15) {
      variantViews.push(
        `QQQ is outperforming SPY by ${formatSignedPct(spread)} (spread, not a price). Consensus is paying for growth/tech. The variant is that a rates or CPI surprise forces a rotation back into lower-duration beta.`,
      );
    } else if (spread < -0.15) {
      variantViews.push(
        `QQQ is lagging SPY by ${formatSignedPct(spread)}. Consensus is de-risking growth. The variant is that AI-capex leadership reasserts if semis stabilize.`,
      );
    }
  }
  if (adv != null && dec != null && spyChange != null && spyChange > 0 && adv < dec) {
    variantViews.push(
      `Index tape is positive while decliners (${dec}) exceed advancers (${adv}). Leadership is narrow. The variant is that index strength fades unless breadth catches up.`,
    );
  }
  if (tlt?.changePercent != null && spyChange != null && tlt.changePercent < 0 && spyChange > 0) {
    variantViews.push(
      `Equities bid with TLT ${formatSignedPct(tlt.changePercent)} (duration weaker). Consensus is growth-over-bonds. The variant is that a hotter inflation print reverses both legs.`,
    );
  }
  if (vixy?.changePercent != null && vixy.changePercent < 0 && spyChange != null && spyChange > 0) {
    variantViews.push(
      `Vol proxy VIXY ${formatSignedPct(vixy.changePercent)} with SPY higher. Complacency can be correct; it is not a forecast. We do not have VIX term-structure or dealer-gamma positioning in this bundle.`,
    );
  }
  if (variantViews.length === 0) {
    variantViews.push(
      "No strong disagreement between index, duration, and breadth prints in this snapshot. Absence of a variant is itself a finding — do not invent one.",
    );
  }

  tape.sort((a, b) => {
    const gi = TAPE_GROUP_ORDER.indexOf(a.group) - TAPE_GROUP_ORDER.indexOf(b.group);
    if (gi !== 0) return gi;
    return a.label.localeCompare(b.label);
  });

  return {
    spyChange,
    tape,
    heatmap,
    relativeBars,
    variantViews,
    quotes,
  };
}

/** Sector heatmap for Overview: tape ∩ Select Sector SPDRs (+ SMH). */
export function buildSectorHeatmap(quotes: QuoteLike[]): HeatmapCell[] {
  const byTicker = quoteMap(quotes);
  return SECTOR_ETFS.map((ticker) => {
    const meta = tickerMeta(ticker);
    const q = byTicker.get(ticker);
    return {
      key: ticker,
      label: meta?.name ?? ticker,
      changePercent: q?.changePercent ?? null,
      available: Boolean(q),
    };
  }).filter((cell) => cell.available);
}

export function buildFactorTiles(quotes: QuoteLike[]): TapeRow[] {
  const byTicker = quoteMap(quotes);
  const spy = byTicker.get("SPY");
  const qqq = byTicker.get("QQQ");
  const iwm = byTicker.get("IWM");
  const hyg = byTicker.get("HYG");
  const lqd = byTicker.get("LQD");
  return [
    factorRow("factor-growth", "QQQ − SPY", qqq, spy),
    factorRow("factor-size", "IWM − SPY", iwm, spy),
    factorRow("factor-credit", "HYG − LQD", hyg, lqd),
  ].filter((row) => row.available);
}

/** Rule-based divergence notes that cite prints. Skip the empty-fallback sentence. */
export function overviewDivergenceNotes(variantViews: string[]): string[] {
  return variantViews.filter(
    (view) => !view.startsWith("No strong disagreement"),
  );
}
