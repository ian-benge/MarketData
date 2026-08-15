import { formatMove, percentChange } from "@/lib/domain/market-math";
import type {
  NormalizedBreadth,
  NormalizedMover,
  NormalizedNewsItem,
  NormalizedQuote,
  ReportEdition,
} from "@/lib/providers/types";
import type { DemoMarketSnapshot } from "@/lib/fixtures/demo-market";
import { editionLabel } from "@/lib/reports/editions";
import {
  EDITION_CONTENT_NOTES,
  SECTION_TITLES,
  requiredSectionKeysFor,
} from "@/lib/reports/section-keys";
import {
  THESIS_STATUS_LABELS,
  mergeTheses,
  seedThesesFromMovers,
  type PriorEditionChange,
  type ThesisRecord,
} from "@/lib/reports/thesis";
import {
  formatLevelRange,
  ideasFromMovers,
  isPlaybookName,
  type TradeIdea,
} from "@/lib/reports/trade-ideas";
import {
  buildReportAnalytics,
  formatPrice,
  formatSignedPct,
  sleeveRows,
  type ReportAnalytics,
} from "@/lib/reports/analytics";
import {
  buildEvidenceNumberTokens,
  type EvidenceBundle,
} from "@/lib/reports/quality-gate";

export type ReportSourceRef = {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  tickers?: string[];
};

export type ReportClaimModel = {
  id: string;
  text: string;
  material: boolean;
  sourceIds: string[];
  tickers?: string[];
};

export type ReportSectionModel = {
  sectionKey: string;
  title: string;
  body: string;
  sourceIds?: string[];
};

export type ReportMoverRow = {
  ticker: string;
  name?: string;
  price: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  volume: number | null;
  catalystSummary: string;
  sourceIds: string[];
};

export type ReportQuoteRow = {
  ticker: string;
  last: number | null;
  changePercent: number | null;
  moveLabel: string | null;
};

export type AfterHoursBlock = {
  materialChangeDetected: boolean;
  quietStatement: string;
  movers: ReportMoverRow[];
  notes: string[];
};

export type ReportDocumentModel = {
  title: string;
  edition: ReportEdition;
  tradingDate: string;
  dataCutoff: string;
  firmName: string;
  executiveSummary: string;
  executiveBullets: string[];
  sections: ReportSectionModel[];
  movers: ReportMoverRow[];
  quotes: ReportQuoteRow[];
  breadth?: {
    advancing: number | null;
    declining: number | null;
    newHighs?: number | null;
    newLows?: number | null;
  };
  claims: ReportClaimModel[];
  sources: ReportSourceRef[];
  labels: string[];
  contentNotes: string;
  methodology: string;
  confidentiality: string;
  isDemo: boolean;
  theses: ThesisRecord[];
  priorEditionChanges: PriorEditionChange[];
  tradeIdeas: TradeIdea[];
  afterHours: AfterHoursBlock;
  analytics: ReportAnalytics;
  promptVersion?: string;
  modelName?: string;
  scheduledAt?: string;
  calendarKind?: "regular" | "early_close" | "holiday_skip";
  /** Resolved at collect time so archived reports do not live-bind later list edits. */
  watchlistTickers?: string[];
};

const TICKER_LABELS: Record<string, string[]> = {
  NVDA: ["ai", "semiconductors", "mega-cap"],
  AMD: ["ai", "semiconductors"],
  MSFT: ["software", "mega-cap", "ai"],
  AAPL: ["consumer", "mega-cap"],
  META: ["social", "mega-cap", "ai"],
  SPY: ["equities", "beta"],
  QQQ: ["tech", "growth"],
  IWM: ["small-cap"],
  TLT: ["rates", "duration"],
  UUP: ["dollar", "fx"],
  GLD: ["commodities", "gold"],
  USO: ["commodities", "energy"],
  "BTC-USD": ["crypto"],
  VIXY: ["volatility"],
};

/**
 * Infer thematic labels from tickers + news titles (no model call).
 */
export function inferLabels(
  tickers: string[],
  news: NormalizedNewsItem[],
): string[] {
  const labels = new Set<string>();
  for (const t of tickers) {
    for (const label of TICKER_LABELS[t.toUpperCase()] ?? []) {
      labels.add(label);
    }
  }
  for (const item of news) {
    const hay = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    if (hay.includes("fed") || hay.includes("yield")) labels.add("policy");
    if (hay.includes("inflation")) labels.add("inflation");
    if (hay.includes("oil") || hay.includes("crude")) labels.add("energy");
    if (hay.includes("ai") || hay.includes("data-center") || hay.includes("cooling")) {
      labels.add("ai");
    }
    if (hay.includes("bitcoin") || hay.includes("etf")) labels.add("crypto");
    if (hay.includes("credit") || hay.includes("spread")) labels.add("credit");
  }
  return [...labels].sort();
}

function editionTitle(edition: ReportEdition, tradingDate: string): string {
  return `${editionLabel(edition)} Market Intelligence — ${tradingDate}`;
}

function quoteRows(quotes: NormalizedQuote[]): ReportQuoteRow[] {
  return quotes.map((q) => ({
    ticker: q.ticker,
    last: q.last,
    changePercent: q.changePercent ?? null,
    moveLabel: formatMove(q.changeAbsolute ?? null, q.changePercent ?? null, {
      currencySymbol: "$",
    }),
  }));
}

function attachCatalysts(
  movers: NormalizedMover[],
  news: NormalizedNewsItem[],
): ReportMoverRow[] {
  return movers.map((m) => {
    const related = news.find((n) =>
      n.tickers.some((t) => t.toUpperCase() === m.ticker.toUpperCase()),
    );
    return {
      ticker: m.ticker,
      name: m.name,
      price: m.last,
      changeAbsolute: m.changeAbsolute,
      changePercent: m.changePercent,
      volume: m.volume ?? null,
      catalystSummary: related
        ? related.title
        : "No confirmed catalyst in evidence bundle",
      sourceIds: related ? [related.id] : [],
    };
  });
}

function buildClaims(
  movers: ReportMoverRow[],
  news: NormalizedNewsItem[],
): ReportClaimModel[] {
  const claims: ReportClaimModel[] = [];
  for (const m of movers) {
    if (m.sourceIds.length === 0) continue;
    if (m.price == null || m.changePercent == null) continue;
    claims.push({
      id: `claim-${m.ticker.toLowerCase()}`,
      text: `${m.ticker} last ${m.price} (${formatSignedPct(m.changePercent)}); catalyst: ${m.catalystSummary}`,
      material: true,
      sourceIds: m.sourceIds,
      tickers: [m.ticker],
    });
  }
  // Always include at least one news-backed claim when news exist
  if (claims.length === 0 && news[0]) {
    claims.push({
      id: "claim-headline-1",
      text: news[0].title,
      material: true,
      sourceIds: [news[0].id],
      tickers: news[0].tickers,
    });
  }
  return claims;
}

function sectionBody(
  key: string,
  ctx: {
    edition: ReportEdition;
    contentNotes: string;
    quotes: ReportQuoteRow[];
    movers: ReportMoverRow[];
    watchlist: ReportQuoteRow[];
    breadth?: NormalizedBreadth | null;
    news: NormalizedNewsItem[];
    labels: string[];
    claims: ReportClaimModel[];
    isDemo: boolean;
    theses: ThesisRecord[];
    priorEditionChanges: PriorEditionChange[];
    tradeIdeas: TradeIdea[];
    afterHours: AfterHoursBlock;
    analytics: ReportAnalytics;
  },
): string {
  const demoPrefix = ctx.isDemo ? "DEMO: " : "";
  const a = ctx.analytics;
  switch (key) {
    case "executive_summary":
      return [
        `${demoPrefix}${ctx.contentNotes}`,
        "",
        ...ctx.claims.slice(0, 4).map((c) => `• ${c.text}`),
        ctx.labels.length ? `\nThemes: ${ctx.labels.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "market_snapshot": {
      const lines = a.tape
        .filter((row) => row.available && row.group !== "factor")
        .map((row) => {
          const vs =
            row.vsSpyPct != null && row.ticker !== "SPY"
              ? `; vs SPY ${formatSignedPct(row.vsSpyPct)}`
              : "";
          return `${row.ticker ?? row.key} ${row.label}: ${formatPrice(row.last)} (${formatSignedPct(row.changePercent)})${vs}`;
        });
      const factors = a.tape
        .filter((row) => row.group === "factor" && row.available)
        .map(
          (row) =>
            `${row.label}: ${formatSignedPct(row.changePercent)} (spread in percentage points, not a price).`,
        );
      return `${demoPrefix}Cross-asset tape from the evidence snapshot only.\n${lines.join("\n")}\n${factors.join("\n")}\n${a.breadthNote}`;
    }
    case "what_is_moving":
      return [
        `${demoPrefix}Event → why it matters → market impact → company/sector → potential trade. Causal status is reported when a cited headline exists; otherwise unclear.`,
        ...a.causality.slice(0, 6).map(
          (chain) =>
            `• [${chain.causalStatus}] EVENT: ${chain.event}\n  WHY: ${chain.whyItMatters}\n  MARKET: ${chain.marketImpact}\n  NAMES: ${chain.companySectorImpact}\n  TRADE: ${chain.potentialTrade}`,
        ),
      ].join("\n");
    case "material_movers":
      return ctx.movers
        .map(
          (m) =>
            `${m.ticker}: last ${formatPrice(m.price)}, ${formatSignedPct(m.changePercent)}; ${m.catalystSummary}`,
        )
        .join("\n");
    case "watchlist":
      return ctx.watchlist
        .map(
          (q) =>
            `${q.ticker}: ${formatPrice(q.last)} (${formatSignedPct(q.changePercent)})`,
        )
        .join("\n");
    case "macro_rates": {
      const pick = (t: string) => a.tape.find((row) => row.ticker === t);
      const tlt = pick("TLT");
      const uup = pick("UUP");
      const hyg = pick("HYG");
      const lqd = pick("LQD");
      const gld = pick("GLD");
      const uso = pick("USO");
      const vixy = pick("VIXY");
      const missing = (row: typeof tlt, name: string) =>
        row?.available
          ? `${name}: ${formatPrice(row.last)} (${formatSignedPct(row.changePercent)})`
          : `${name}: not in coverage universe this snapshot.`;
      return [
        `${demoPrefix}Macro proxies only — no fabricated Treasury yields, breakevens, or CDS.`,
        missing(tlt, "TLT duration"),
        missing(uup, "UUP dollar"),
        missing(hyg, "HYG high-yield"),
        missing(lqd, "LQD IG credit"),
        missing(gld, "GLD gold"),
        missing(uso, "USO crude"),
        missing(vixy, "VIXY vol proxy"),
        "Credit: HYG/LQD are ETF proxies, not cash bond traces. Vol: VIXY is not VIX futures term structure.",
      ].join("\n");
    }
    case "news_catalysts":
      return ctx.news.map((n) => `• ${n.title} [${n.id}]`).join("\n");
    case "sources":
      return ctx.news
        .map((n) => `${n.id}: ${n.title} — ${n.url}`)
        .join("\n");
    case "methodology":
      return [
        "Methodology: prices, percents, and volumes are taken exclusively from the provided market snapshot.",
        "Relative performance vs SPY is a difference of session percent changes (percentage points), not a price.",
        "Causal language is limited to confirmed/reported/inferred/unclear labels backed by sourceIds.",
        "Material movers use configured thresholds; bad ticks and illiquid prints are filtered.",
        "When the primary feed is IEX, movers are tracked-universe only and are not a consolidated tape.",
        "Options IV, expected move, and unusual flow are omitted unless a licensed options observation is in the bundle.",
        "Trade ideas are hypotheses with explicit invalidation. This report does not place orders.",
        ctx.isDemo
          ? "This document is DEMO / fixture content and must not be used for trading decisions."
          : "Delayed data may be present; see delayStatus on underlying quotes.",
      ].join("\n");
    case "changes_since_previous":
      if (ctx.priorEditionChanges.length === 0) {
        return `${demoPrefix}No prior-edition theses were available to audit.`;
      }
      return [
        `${demoPrefix}Prior theses are preserved. Statuses: CONFIRMED, PENDING, WEAKENED, INVALIDATED, TARGET_REACHED.`,
        ...ctx.priorEditionChanges.map(
          (row) =>
            `• ${row.priorThesis} | ${THESIS_STATUS_LABELS[row.previousStatus]} → ${THESIS_STATUS_LABELS[row.currentStatus]}. ${row.whatChanged} Evidence: ${row.newEvidence} Response: ${row.marketResponse}${row.affectsTrade ? " AFFECTS TRADE." : ""}`,
        ),
      ].join("\n");
    case "regular_session_recap":
      return [
        `${demoPrefix}Regular-session recap (not repeated in the after-hours block).`,
        a.tape
          .filter((row) =>
            ["index", "rates", "fx", "commodity", "vol", "crypto"].includes(
              row.group,
            ),
          )
          .filter((row) => row.available)
          .map(
            (row) =>
              `${row.ticker ?? row.key}: ${formatPrice(row.last)} (${formatSignedPct(row.changePercent)})`,
          )
          .join("\n"),
        a.breadthNote,
        "Closing prints may remain preliminary until the official exchange close is finalized.",
      ].join("\n");
    case "after_hours_developments":
      if (!ctx.afterHours.materialChangeDetected) {
        return `${demoPrefix}${ctx.afterHours.quietStatement}`;
      }
      return [
        `${demoPrefix}First-hour after-hours developments (not a repeat of the regular-session recap).`,
        ...ctx.afterHours.movers.map(
          (m) =>
            `${m.ticker}: ${formatPrice(m.price)} (${formatSignedPct(m.changePercent)}) — ${m.catalystSummary}. Liquidity in extended hours can be thin.`,
        ),
        ...ctx.afterHours.notes,
      ].join("\n");
    case "trade_book_status":
      return [
        `${demoPrefix}Final status of premarket and midday theses. None were silently rewritten or removed.`,
        ...ctx.theses.map(
          (t) =>
            `• [${THESIS_STATUS_LABELS[t.status]}] ${t.statement} (${t.tickers.join(", ") || "market"}) — ${t.marketResponse}`,
        ),
      ].join("\n");
    case "next_session_setup":
      return [
        `${demoPrefix}Overnight and next-session setup.`,
        `Watchlist: ${ctx.watchlist.map((q) => q.ticker).join(", ") || "none"}.`,
        a.scenarios.whatWouldChangeMyMind,
        ctx.news.slice(0, 3).map((n) => `• ${n.title}`).join("\n"),
        "This report does not place orders or connect ideas to automatic execution.",
      ].join("\n");
    case "pm_playbook":
      return [
        `${demoPrefix}Actionable hypotheses only. R/R is from the entry-zone midpoint. No execution hook.`,
        ...ctx.tradeIdeas.map((idea) => {
          const pair = idea.pairLeg ? ` / short ${idea.pairLeg}` : "";
          return `• ${idea.action} ${idea.strategyType} ${idea.direction} ${idea.ticker}${pair} | last ${formatPrice(idea.currentPrice)} | entry ${formatLevelRange(idea.entryLow, idea.entryHigh)} | trigger: ${idea.trigger} | invalidation: ${idea.invalidationFact} | T1 ${idea.target1} (R/R ${idea.rewardRisk1 ?? "n/a"}) | T2 ${idea.target2} (R/R ${idea.rewardRisk2 ?? "n/a"}) | hold ${idea.holdingPeriod} | confidence ${idea.confidence}/5 | options: ${idea.optionsStructure ?? "none — no IV/flow in bundle"} | monitor: ${idea.monitor} | ${idea.thesis}`;
        }),
      ].join("\n");
    case "ai_infrastructure": {
      const sleeves = sleeveRows(a.aiInfrastructure);
      if (sleeves.length === 0) {
        return `${demoPrefix}No AI-infrastructure names were in this snapshot. Sleeves (semis, equipment, networking, hyperscalers, neoclouds, power/cooling) are omitted rather than filled with estimates.`;
      }
      return [
        `${demoPrefix}AI-infrastructure map from names actually in the snapshot. Missing sleeves are omitted, not estimated.`,
        ...sleeves.map(
          (sleeve) =>
            `${sleeve.label}: ${sleeve.names
              .map(
                (n) =>
                  `${n.ticker} ${formatPrice(n.last)} (${formatSignedPct(n.changePercent)}; vs SPY ${formatSignedPct(n.vsSpyPct)})`,
              )
              .join("; ")}`,
        ),
      ].join("\n");
    }
    case "scenarios_and_variants":
      return [
        `${demoPrefix}Paths are qualitative and anchored to prints in this snapshot — not price targets.`,
        `BULL: ${a.scenarios.bull}`,
        `BASE: ${a.scenarios.base}`,
        `BEAR: ${a.scenarios.bear}`,
        `CHANGE MY MIND: ${a.scenarios.whatWouldChangeMyMind}`,
        "Variant perception:",
        ...a.variantViews.map((v) => `• ${v}`),
      ].join("\n");
    case "options_desk":
      return `${demoPrefix}${a.optionsDesk.reason}`;
    case "earnings_calendar": {
      const hits = ctx.news.filter((n) =>
        /\b(earnings|eps|guidance|consensus|estimate|beat|miss)\b/i.test(
          `${n.title} ${n.summary ?? ""}`,
        ),
      );
      return [
        `${demoPrefix}No earnings calendar, consensus EPS/revenue, guidance extract, or historical earnings-reaction study is in this evidence bundle. Do not infer beat/miss from the tape alone.`,
        hits.length > 0
          ? `Headlines that mention earnings/guidance/estimates:\n${hits.map((n) => `• ${n.title} [${n.id}]`).join("\n")}`
          : "No earnings/guidance headlines in this snapshot.",
      ].join("\n");
    }
    default:
      return "";
  }
}

export type BuildReportInput = {
  edition: ReportEdition;
  tradingDate: string;
  firmName?: string;
  market: Pick<
    DemoMarketSnapshot,
    "quotes" | "movers" | "breadth" | "watchlistTickers" | "asOf" | "note"
  >;
  news: NormalizedNewsItem[];
  isDemo?: boolean;
  confidentiality?: string;
  priorDocuments?: ReportDocumentModel[];
  afterHoursMovers?: NormalizedMover[];
  afterHoursNews?: NormalizedNewsItem[];
  promptVersion?: string;
  modelName?: string;
  scheduledAt?: string;
  calendarKind?: "regular" | "early_close" | "holiday_skip";
};

const QUIET_AH =
  "No material after-hours change was detected in the first hour after the official regular-session close.";

/**
 * Builds a full report document from a market snapshot + news.
 * Never fabricates prices — only formats values present on the snapshot.
 */
export function buildReportDocument(
  input: BuildReportInput,
): ReportDocumentModel {
  const isDemo = input.isDemo ?? false;
  const contentNotes = EDITION_CONTENT_NOTES[input.edition];
  const quotes = quoteRows(input.market.quotes);
  const movers = attachCatalysts(input.market.movers, input.news);
  const watchlist = quotes.filter((q) =>
    input.market.watchlistTickers.includes(q.ticker),
  );
  const labels = inferLabels(
    [
      ...input.market.quotes.map((q) => q.ticker),
      ...input.news.flatMap((n) => n.tickers),
    ],
    input.news,
  );
  const claims = buildClaims(movers, input.news);
  const sources: ReportSourceRef[] = input.news.map((n) => ({
    id: n.id,
    title: n.title,
    url: n.url,
    publisher: n.publisher,
    tickers: n.tickers,
  }));

  const seeded = seedThesesFromMovers(
    input.edition,
    movers.filter(
      (m) =>
        isPlaybookName(m.ticker, m.sourceIds.length > 0) &&
        m.sourceIds.length > 0,
    ),
  );
  const priorTheses: ThesisRecord[] = [];
  const seenPrior = new Set<string>();
  for (const doc of input.priorDocuments ?? []) {
    for (const thesis of doc.theses) {
      if (seenPrior.has(thesis.id)) continue;
      seenPrior.add(thesis.id);
      priorTheses.push(thesis);
    }
  }
  const { theses, changes } = mergeTheses(
    priorTheses,
    seeded,
    quotes.map((q) => ({
      ticker: q.ticker,
      last: q.last,
      changePercent: q.changePercent,
    })),
  );

  const ahMovers = attachCatalysts(
    input.afterHoursMovers ?? [],
    input.afterHoursNews ?? input.news,
  );
  const afterHours: AfterHoursBlock = {
    materialChangeDetected: ahMovers.length > 0,
    quietStatement: QUIET_AH,
    movers: ahMovers,
    notes:
      ahMovers.length > 0
        ? [
            "Extended-hours prints can be wide and unrepresentative. Treat size and last as indicative.",
          ]
        : [],
  };

  const tradeIdeas = ideasFromMovers(
    input.edition,
    input.market.asOf,
    movers,
  );

  const analytics = buildReportAnalytics({
    quotes,
    movers,
    news: input.news,
    breadth: input.market.breadth,
  });

  const ctx = {
    edition: input.edition,
    contentNotes,
    quotes,
    movers,
    watchlist,
    breadth: input.market.breadth,
    news: input.news,
    labels,
    claims,
    isDemo,
    theses,
    priorEditionChanges: changes,
    tradeIdeas,
    afterHours,
    analytics,
  };

  const sectionKeys = requiredSectionKeysFor(input.edition);
  const sections: ReportSectionModel[] = sectionKeys.map((key) => ({
    sectionKey: key,
    title: SECTION_TITLES[key] ?? key,
    body: sectionBody(key, ctx),
    sourceIds:
      key === "news_catalysts" || key === "sources"
        ? input.news.map((n) => n.id)
        : movers.flatMap((m) => m.sourceIds),
  }));

  const spy = quotes.find((q) => q.ticker === "SPY");
  const qqq = quotes.find((q) => q.ticker === "QQQ");
  const tlt = quotes.find((q) => q.ticker === "TLT");
  const lead = analytics.causality[0];
  const executiveBullets = [
    `SPY ${formatPrice(spy?.last)} (${formatSignedPct(spy?.changePercent)}) · QQQ ${formatPrice(qqq?.last)} (${formatSignedPct(qqq?.changePercent)}) · TLT ${formatPrice(tlt?.last)} (${formatSignedPct(tlt?.changePercent)}).`,
    analytics.breadthNote,
    lead
      ? `${lead.event} → ${lead.potentialTrade}`
      : "No lead catalyst chain in this snapshot.",
    analytics.variantViews[0] ?? "No variant view forced.",
    claims[0]?.text ?? "No material claims in evidence.",
  ];
  const executiveSummary = [
    isDemo ? "DEMO edition." : null,
    executiveBullets[0],
    lead ? `${lead.event}.` : null,
    contentNotes,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: editionTitle(input.edition, input.tradingDate),
    edition: input.edition,
    tradingDate: input.tradingDate,
    dataCutoff: input.market.asOf,
    firmName: input.firmName ?? "IB Market Data",
    executiveSummary,
    executiveBullets,
    sections,
    movers,
    quotes,
    breadth: input.market.breadth
      ? {
          advancing: input.market.breadth.advancing,
          declining: input.market.breadth.declining,
          newHighs: input.market.breadth.newHighs,
          newLows: input.market.breadth.newLows,
        }
      : undefined,
    claims,
    sources,
    labels,
    contentNotes,
    methodology: sectionBody("methodology", ctx),
    confidentiality:
      input.confidentiality ??
      "CONFIDENTIAL — For intended recipients only. Do not redistribute. Public information only; not personalized investment advice.",
    isDemo,
    theses,
    priorEditionChanges: changes,
    tradeIdeas,
    afterHours,
    analytics,
    promptVersion: input.promptVersion,
    modelName: input.modelName,
    scheduledAt: input.scheduledAt,
    calendarKind: input.calendarKind,
    watchlistTickers: [...input.market.watchlistTickers],
  };
}

/** Evidence bundle for quality-gate invented-number checks. */
export function evidenceBundleFromMarket(
  market: Pick<DemoMarketSnapshot, "quotes" | "movers" | "breadth">,
  news: NormalizedNewsItem[],
  extras?: { extraNumbers?: Array<number | null | undefined> },
): EvidenceBundle {
  const numbers: Array<number | null | undefined> = [];
  for (const q of market.quotes) {
    numbers.push(
      q.last,
      q.priorClose,
      q.changeAbsolute,
      q.changePercent,
      q.volume,
      q.open,
      q.high,
      q.low,
    );
  }
  for (const m of market.movers) {
    numbers.push(m.last, m.changeAbsolute, m.changePercent, m.volume);
  }
  if (market.breadth) {
    numbers.push(
      market.breadth.advancing,
      market.breadth.declining,
      market.breadth.unchanged,
      market.breadth.newHighs,
      market.breadth.newLows,
      market.breadth.advVolume,
      market.breadth.decVolume,
    );
  }

  for (const q of market.quotes) {
    numbers.push(percentChange(q.last, q.priorClose));
  }
  if (extras?.extraNumbers) numbers.push(...extras.extraNumbers);

  const analytics = buildReportAnalytics({
    quotes: market.quotes.map((q) => ({
      ticker: q.ticker,
      last: q.last,
      changePercent: q.changePercent ?? null,
    })),
    movers: market.movers.map((m) => ({
      ticker: m.ticker,
      price: m.last,
      changePercent: m.changePercent,
      catalystSummary: "",
      sourceIds: [],
    })),
    news,
    breadth: market.breadth,
  });
  numbers.push(...analytics.numbers);

  return {
    numberTokens: buildEvidenceNumberTokens(numbers),
    textBlobs: [
      JSON.stringify(market.quotes),
      JSON.stringify(market.movers),
      JSON.stringify(market.breadth),
      ...news.map((n) => `${n.title} ${n.summary ?? ""}`),
    ],
  };
}

export function extraNumbersFromDocument(document: ReportDocumentModel): number[] {
  const numbers: number[] = [...(document.analytics?.numbers ?? [])];
  for (const idea of document.tradeIdeas) {
    numbers.push(
      idea.entryLow,
      idea.entryHigh,
      idea.stop,
      idea.target1,
      idea.target2,
      idea.rewardRisk1 ?? NaN,
      idea.rewardRisk2 ?? NaN,
      idea.currentPrice ?? NaN,
      idea.confidence,
    );
    if (idea.pairLeg) {
      const long = document.movers.find((m) => m.ticker === idea.ticker);
      const short = document.movers.find((m) => m.ticker === idea.pairLeg);
      if (long?.changePercent != null && short?.changePercent != null) {
        numbers.push(
          Math.round((long.changePercent - short.changePercent) * 100) / 100,
        );
      }
    }
  }
  for (const thesis of document.theses) {
    if (thesis.targetPrice != null) numbers.push(thesis.targetPrice);
    if (thesis.invalidationPrice != null) numbers.push(thesis.invalidationPrice);
  }
  return numbers.filter((n) => Number.isFinite(n));
}
