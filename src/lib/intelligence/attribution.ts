import { COMPANY_SPECIFIC_TYPES, MACRO_TYPES } from "./event-classify";
import { detectSignificantMove, newsWindowForSession } from "./move-detect";
import type {
  AttributionKind,
  ConfidenceLevel,
  IntelligenceEvent,
  MoveExplanation,
  MoveWindow,
  QuoteContext,
} from "./types";
import { ATTRIBUTION_LABELS } from "./types";

const PRIMARY_HOSTS = [
  "sec.gov",
  "edgar",
  "federalreserve.gov",
  "treasury.gov",
  "bls.gov",
  "eia.gov",
];

function inWindow(iso: string, start: string, end: string): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= Date.parse(start) && at <= Date.parse(end);
}

function tickerHit(
  event: IntelligenceEvent,
  ticker: string,
  matchLowConfidence = false,
): boolean {
  return event.tickers.some(
    (entity) =>
      entity.ticker === ticker &&
      (matchLowConfidence ||
        entity.confidence === "high" ||
        entity.confidence === "medium"),
  );
}

function isPrimarySource(event: IntelligenceEvent): boolean {
  return event.sources.some((source) => {
    if (source.sourceClass === "primary" || source.sourceQuality === "primary") return true;
    const host = (source.canonicalUrl ?? source.url).toLowerCase();
    return PRIMARY_HOSTS.some((needle) => host.includes(needle));
  });
}

function supporting(event: IntelligenceEvent) {
  return {
    id: event.id,
    title: event.title,
    publishedAt: event.publishedAt,
    url: event.representative.url,
    publisher: event.representative.publisher,
    eventType: event.eventType,
  };
}

function causalFor(kind: AttributionKind): MoveExplanation["causalStatus"] {
  if (kind === "confirmed_company") return "confirmed";
  if (kind === "likely_catalyst" || kind === "multiple") return "reported";
  if (kind === "sympathy") return "inferred";
  return "unclear";
}

export function attributeMove(input: {
  quote: QuoteContext;
  events: IntelligenceEvent[];
  session?: string | null;
  now?: Date;
  peerTickers?: string[];
  tickerThemes?: string[];
  window?: MoveWindow;
  matchLowConfidence?: boolean;
}): MoveExplanation {
  const now = input.now ?? new Date();
  const detected = detectSignificantMove(input.quote);
  const window =
    input.window ?? newsWindowForSession(input.session ?? input.quote.session, now);
  const ticker = input.quote.ticker.toUpperCase();
  const allowLow = input.matchLowConfidence === true;
  const inScope = input.events.filter((event) =>
    inWindow(event.publishedAt, window.start, window.end),
  );
  const company = inScope.filter(
    (event) =>
      tickerHit(event, ticker, allowLow) && COMPANY_SPECIFIC_TYPES.has(event.eventType),
  );
  const anyTicker = inScope.filter((event) => tickerHit(event, ticker, allowLow));
  const primary = company.filter(isPrimarySource);
  const peerSet = new Set((input.peerTickers ?? []).map((value) => value.toUpperCase()));
  const tickerThemes = new Set(input.tickerThemes ?? []);
  const sympathy = inScope.filter((event) => {
    if (tickerHit(event, ticker, allowLow) && COMPANY_SPECIFIC_TYPES.has(event.eventType)) {
      return false;
    }
    const themePeer = event.secondOrder.some((entity) => entity.ticker === ticker);
    const peerHit = event.tickers.some((entity) => peerSet.has(entity.ticker));
    const themeHit =
      tickerThemes.size > 0 && event.themes.some((theme) => tickerThemes.has(theme));
    const macroLinked = MACRO_TYPES.has(event.eventType) && (themeHit || peerHit || themePeer);
    return themePeer || peerHit || themeHit || macroLinked;
  });

  let attribution: AttributionKind = "unknown";
  let confidence: ConfidenceLevel = "unknown";
  let evidenceNature: "fact" | "inference" = "fact";
  let headline = "No verified catalyst found";
  let detail =
    "No company-specific filing or credible ticker-matched headline was found in the news window. The move is unexplained by available sources — this is not a claim that no catalyst exists.";
  let used = primary.length ? primary : company.length ? company : anyTicker;
  let coverageGap: string | null = null;

  if (primary.length) {
    attribution = "confirmed_company";
    confidence = "confirmed";
    evidenceNature = "fact";
    used = primary;
    headline = `${ATTRIBUTION_LABELS.confirmed_company}: ${primary[0]!.title}`;
    detail = `Primary-source item published ${primary[0]!.publishedAt}. Ticker match is from the filing/provider, not a generated causal story.`;
  } else if (company.length >= 2) {
    const types = new Set(company.map((event) => event.eventType));
    if (types.size >= 2) {
      attribution = "multiple";
      confidence = "probable";
      evidenceNature = "inference";
      used = company.slice(0, 4);
      headline = `${ATTRIBUTION_LABELS.multiple}: ${used.map((event) => event.eventTypeLabel).join(", ")}`;
      detail =
        "More than one distinct company-specific event type is in the window. The system does not pick a single cause.";
    } else {
      attribution = "likely_catalyst";
      confidence = "probable";
      evidenceNature = "inference";
      used = company;
      headline = `${ATTRIBUTION_LABELS.likely_catalyst}: ${company[0]!.title}`;
      detail =
        "Timing and ticker-matched reporting support this item as a likely catalyst. That is system inference, not a confirmed company disclosure.";
    }
  } else if (company.length === 1 || anyTicker.length) {
    const lead = (company[0] ?? anyTicker[0])!;
    const highConfidence = lead.tickers.some(
      (entity) => entity.ticker === ticker && entity.confidence === "high",
    );
    attribution = "likely_catalyst";
    confidence = highConfidence ? "probable" : "speculative";
    evidenceNature = "inference";
    used = [lead];
    headline = `${ATTRIBUTION_LABELS.likely_catalyst}: ${lead.title}`;
    detail = highConfidence
      ? "A ticker-tagged wire/secondary item lands in the move window. Treat as likely, not confirmed, unless a primary filing is present."
      : "Entity match is probable rather than provider-tagged. Do not treat this as a confirmed cause.";
  } else if (sympathy.length && detected.significant) {
    attribution = "sympathy";
    confidence = "speculative";
    evidenceNature = "inference";
    used = sympathy.slice(0, 3);
    headline = `${ATTRIBUTION_LABELS.sympathy}: ${used[0]!.title}`;
    detail =
      "No company-specific catalyst matched this ticker. Related sector, theme, peer, commodity, or macro headlines are in the window. Sympathy is an inference from co-movement, not proof.";
  } else {
    used = [];
    evidenceNature = "inference";
    if (!inScope.length) {
      coverageGap =
        "No headlines were available in the move window. Source coverage may be delayed, thin, or untagged.";
      detail = `${detail} ${coverageGap}`;
    }
  }

  if (!detected.significant && attribution !== "unknown") {
    detail = `${detail} Price/volume flags do not meet the unusual-move thresholds. This panel answers the asked ticker query; it is not a claim that the print is unusual.`;
  }

  const relatedTickers = [
    ...new Set(used.flatMap((event) => event.tickers.map((entity) => entity.ticker))),
  ].filter((symbol) => symbol !== ticker);
  const themes = [...new Set(used.flatMap((event) => event.themes))];

  return {
    ticker,
    significant: detected.significant,
    changePercent: detected.changePercent,
    relativeVolume: detected.relativeVolume,
    session: input.session ?? detected.session ?? null,
    flags: detected.flags,
    direction: detected.direction,
    attribution,
    confidence,
    evidenceNature,
    causalStatus: causalFor(attribution),
    headline,
    detail,
    supportingEvents: used.slice(0, 5).map(supporting),
    relatedTickers: relatedTickers.slice(0, 8),
    themes,
    window,
    coverageGap,
  };
}

export function attributeMoves(
  quotes: QuoteContext[],
  events: IntelligenceEvent[],
  session?: string | null,
  now?: Date,
  peerByTicker?: Map<string, string[]>,
  themesByTicker?: Map<string, string[]>,
  options?: { window?: MoveWindow; matchLowConfidence?: boolean },
): MoveExplanation[] {
  return quotes.map((quote) =>
    attributeMove({
      quote,
      events,
      session,
      now,
      peerTickers: peerByTicker?.get(quote.ticker.toUpperCase()),
      tickerThemes: themesByTicker?.get(quote.ticker.toUpperCase()),
      window: options?.window,
      matchLowConfidence: options?.matchLowConfidence,
    }),
  );
}
