import type { NormalizedNewsItem } from "@/lib/providers/types";
import {
  buildSharedMarketAnalytics,
  formatPrice,
  formatSignedPct,
  rowFromQuote,
  type HeatmapCell,
  type QuoteLike,
  type TapeRow,
} from "@/lib/market-data/overview-analytics";
import {
  AI_SLEEVE_LABELS,
  tickerMeta,
  type AiInfraSleeve,
} from "@/lib/reports/universe";

export type { HeatmapCell, QuoteLike, TapeRow } from "@/lib/market-data/overview-analytics";
export { formatPrice, formatSignedPct } from "@/lib/market-data/overview-analytics";

export type MoverLike = {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  catalystSummary: string;
  sourceIds: string[];
};

export type CausalityChain = {
  id: string;
  event: string;
  whyItMatters: string;
  marketImpact: string;
  companySectorImpact: string;
  potentialTrade: string;
  tickers: string[];
  sourceIds: string[];
  causalStatus: "reported" | "inferred" | "unclear";
};

export type ScenarioSet = {
  bull: string;
  base: string;
  bear: string;
  whatWouldChangeMyMind: string;
};

export type OptionsDesk = {
  available: false;
  reason: string;
};

export type ReportAnalytics = {
  spyChange: number | null;
  tape: TapeRow[];
  heatmap: HeatmapCell[];
  relativeBars: TapeRow[];
  aiInfrastructure: TapeRow[];
  causality: CausalityChain[];
  scenarios: ScenarioSet;
  variantViews: string[];
  optionsDesk: OptionsDesk;
  breadthNote: string;
  numbers: number[];
};

function whyItMatters(tickers: string[], title: string): string {
  const hay = `${title} ${tickers.join(" ")}`.toLowerCase();
  const groups = new Set(
    tickers.map((t) => tickerMeta(t)?.group).filter(Boolean),
  );
  if (hay.includes("fed") || hay.includes("inflation") || hay.includes("yield")) {
    return "Policy/inflation news transmits through real yields into duration, equity duration (growth), and the dollar. Second order: financials vs. long-duration tech. Third order: housing-sensitive and high-yield spreads if the path of cuts is repriced.";
  }
  if (groups.has("ai_infra") || hay.includes("ai") || hay.includes("data-center") || hay.includes("nvidia") || hay.includes("accelerator")) {
    return "AI-capex news is a cluster shock: semis and networking first, then hyperscaler opex/capex, then power, cooling, and grid. Second order: crowding and factor beta (QQQ/SMH vs. SPY). Third order: rates if the growth impulse is strong enough to reprice the path of policy.";
  }
  if (groups.has("commodity") || hay.includes("crude") || hay.includes("oil") || hay.includes("inventory")) {
    return "Energy inventory/price shocks hit XLE and inflation breakevens first. Second order: real income and discretionary. Third order: the dollar and rates if the move is large enough to change the CPI path.";
  }
  if (hay.includes("bitcoin") || hay.includes("crypto") || hay.includes("etf")) {
    return "Crypto beta is a risk-appetite gauge, not a cash-flow story. Second order: high-beta Nasdaq and liquidity-sensitive small caps. Do not treat ETF flow headlines as a substitute for positioning data we do not have.";
  }
  if (hay.includes("apple") || hay.includes("supplier")) {
    return "Hardware-supply news is a company event with index weight. Second order: Asian supply chain and mega-cap factor. Third order: consumer hardware multiples if the print changes unit/ASP assumptions — those estimates are not in this bundle.";
  }
  return "The headline is in the evidence bundle; transmission is inferred from which proxies actually printed, not from a model forecast.";
}

function marketImpactLine(
  tickers: string[],
  quotes: Map<string, QuoteLike>,
  spy: QuoteLike | undefined,
): string {
  const spyBit = spy
    ? `SPY ${formatPrice(spy.last)} (${formatSignedPct(spy.changePercent)})`
    : "SPY print unavailable";
  const named = tickers
    .map((t) => quotes.get(t.toUpperCase()))
    .filter((q): q is QuoteLike => Boolean(q))
    .slice(0, 3)
    .map((q) => `${q.ticker} ${formatSignedPct(q.changePercent)}`);
  const qqq = quotes.get("QQQ");
  const tlt = quotes.get("TLT");
  const extras = [
    qqq ? `QQQ ${formatSignedPct(qqq.changePercent)}` : null,
    tlt ? `TLT ${formatSignedPct(tlt.changePercent)}` : null,
  ].filter(Boolean);
  return [spyBit, ...named, ...extras].join(" · ");
}

export function buildReportAnalytics(input: {
  quotes: QuoteLike[];
  movers: MoverLike[];
  news: NormalizedNewsItem[];
  breadth?: {
    advancing: number | null;
    declining: number | null;
    newHighs?: number | null;
    newLows?: number | null;
  };
}): ReportAnalytics {
  const shared = buildSharedMarketAnalytics({
    quotes: input.quotes,
    breadth: input.breadth,
  });
  const quotes = shared.quotes;
  const spy = quotes.get("SPY");
  const spyChange = shared.spyChange;
  const tape = shared.tape;
  const heatmap = shared.heatmap;
  const relativeBars = shared.relativeBars;
  const variantViews = shared.variantViews;
  const tlt = quotes.get("TLT");

  const aiInfrastructure = input.quotes
    .filter((q) => tickerMeta(q.ticker)?.group === "ai_infra")
    .map((q) => rowFromQuote(q.ticker, quotes, spyChange, "ai_infra"))
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));

  const usedNews = new Set<string>();
  const rankedMovers = [...input.movers].sort((a, b) => {
    const ac = a.sourceIds.length > 0 ? 0 : 1;
    const bc = b.sourceIds.length > 0 ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
  });
  const causality: CausalityChain[] = [];
  for (const mover of rankedMovers.slice(0, 6)) {
    const news =
      input.news.find((n) => n.id && mover.sourceIds.includes(n.id)) ??
      input.news.find((n) =>
        n.tickers.some((t) => t.toUpperCase() === mover.ticker.toUpperCase()),
      );
    if (news) usedNews.add(news.id);
    const hasNews = Boolean(news);
    const event = news?.title ?? `${mover.ticker} tape move without a confirmed catalyst in the bundle`;
    const trade =
      mover.changePercent == null
        ? "NO_TRADE — last print missing."
        : hasNews
          ? `Hypothesis only: ${mover.changePercent >= 0 ? "long" : "short"} ${mover.ticker} if the catalyst remains intact; wait if the spread is wide or the headline reverses.`
          : `WAIT — ${mover.ticker} is a material print without a cited catalyst. Do not force a trade.`;
    causality.push({
      id: `chain-${mover.ticker.toLowerCase()}`,
      event,
      whyItMatters: whyItMatters(news?.tickers ?? [mover.ticker], event),
      marketImpact: marketImpactLine(
        news?.tickers ?? [mover.ticker],
        quotes,
        spy,
      ),
      companySectorImpact: `${mover.ticker} last ${formatPrice(mover.price)} (${formatSignedPct(mover.changePercent)}). ${mover.catalystSummary}.`,
      potentialTrade: trade,
      tickers: news?.tickers?.length ? news.tickers : [mover.ticker],
      sourceIds: mover.sourceIds,
      causalStatus: hasNews ? "reported" : "unclear",
    });
  }
  for (const item of input.news) {
    if (usedNews.has(item.id) || causality.length >= 8) continue;
    causality.push({
      id: `chain-news-${item.id}`,
      event: item.title,
      whyItMatters: whyItMatters(item.tickers, item.title),
      marketImpact: marketImpactLine(item.tickers, quotes, spy),
      companySectorImpact:
        item.tickers.length > 0
          ? `Tagged names: ${item.tickers.join(", ")}. Company-level estimate revisions are not in this bundle.`
          : "No ticker tags on this headline.",
      potentialTrade:
        "WAIT — headline is in evidence; no forced expression without a material print and a defined invalidation.",
      tickers: item.tickers,
      sourceIds: [item.id],
      causalStatus: "reported",
    });
  }

  const adv = input.breadth?.advancing ?? null;
  const dec = input.breadth?.declining ?? null;
  const breadthNote =
    adv != null && dec != null
      ? `Tracked-universe breadth only (IEX single-exchange, not a consolidated tape): adv ${adv} / dec ${dec}${
          input.breadth?.newHighs != null
            ? `; new highs ${input.breadth.newHighs} / new lows ${input.breadth.newLows ?? "n/a"}`
            : ""
        }.`
      : "Breadth unavailable in this snapshot.";

  const scenarios: ScenarioSet = {
    base: spy
      ? `Base: tape holds near SPY ${formatPrice(spy.last)} (${formatSignedPct(spy.changePercent)}) with the same leadership set. This is a description of the current evidence, not a target.`
      : "Base: insufficient index print to anchor a path.",
    bull: causality[0]
      ? `Bull: the lead catalyst remains intact (${causality[0].event}). Growth/AI proxies extend relative to SPY. Invalidated if the cited headline is walked back or the lead name loses the session's range.`
      : "Bull: not specified — no lead catalyst in the bundle.",
    bear: tlt
      ? `Bear: duration stress continues (TLT ${formatPrice(tlt.last)}, ${formatSignedPct(tlt.changePercent)}) and/or the lead AI/growth name reverses. Small-cap (IWM) would be the cleaner risk-off tell if it underperforms SPY.`
      : "Bear: a reversal in the lead mover plus a bid for the vol proxy would argue to cut gross.",
    whatWouldChangeMyMind: "A primary-source walk-back of the lead headline, a reversal through the lead name's invalidation print, or breadth that contradicts the index direction for the rest of the session.",
  };

  const optionsDesk: OptionsDesk = {
    available: false,
    reason:
      "Listed options IV, expected move, skew, open interest, and unusual flow are not in this evidence bundle. No options structure is recommended. Do not infer bought/sold or bullish/bearish flow.",
  };

  const numbers: number[] = [];
  for (const row of [...tape, ...aiInfrastructure]) {
    if (row.last != null) numbers.push(row.last);
    if (row.changePercent != null) numbers.push(row.changePercent);
    if (row.vsSpyPct != null) numbers.push(row.vsSpyPct);
  }
  if (adv != null) numbers.push(adv);
  if (dec != null) numbers.push(dec);
  if (input.breadth?.newHighs != null) numbers.push(input.breadth.newHighs);
  if (input.breadth?.newLows != null) numbers.push(input.breadth.newLows);

  return {
    spyChange,
    tape,
    heatmap,
    relativeBars,
    aiInfrastructure,
    causality,
    scenarios,
    variantViews,
    optionsDesk,
    breadthNote,
    numbers,
  };
}

export function sleeveRows(rows: TapeRow[]): Array<{
  sleeve: AiInfraSleeve;
  label: string;
  names: TapeRow[];
}> {
  const order: AiInfraSleeve[] = [
    "semis",
    "equipment",
    "networking",
    "hyperscalers",
    "neoclouds",
    "power_cooling",
  ];
  return order
    .map((sleeve) => ({
      sleeve,
      label: AI_SLEEVE_LABELS[sleeve],
      names: rows.filter((r) => r.sleeve === sleeve),
    }))
    .filter((g) => g.names.length > 0);
}
