import { EVENT_TYPES, type EventType, type ParsedNewsQuery } from "./types";
import { resolveAlias, resolveQueryTickers } from "./entity-resolve";
import { expandThemeQuery } from "./themes";
import { newsWindowForSession, parseTimeWindow } from "./windows";

export { parseTimeWindow } from "./windows";

const EVENT_ALIASES: Array<{ type: EventType; pattern: RegExp }> = [
  { type: "export_control", pattern: /export[- ]control|entity list|chip ban/i },
  { type: "tariff", pattern: /\btariffs?\b/i },
  { type: "earnings", pattern: /\bearnings\b|\beps\b/i },
  { type: "guidance", pattern: /\bguidance\b|\boutlook\b/i },
  { type: "filing", pattern: /\b8-k\b|\b10-q\b|filings?/i },
  { type: "ma", pattern: /\bm&a\b|merger|acquisition/i },
  { type: "offering", pattern: /offering|follow[- ]on/i },
  { type: "buyback", pattern: /buyback|repurchase/i },
  { type: "analyst", pattern: /upgrade|downgrade|price target|analyst/i },
  { type: "contract", pattern: /contract|ppa|power purchase/i },
  { type: "cyber", pattern: /cyber|ransomware|breach/i },
  { type: "commodity", pattern: /crude|oil|lng|natural gas|gold|copper|uranium/i },
  { type: "central_bank", pattern: /fomc|fed |federal reserve|rate decision/i },
  { type: "economic", pattern: /\bcpi\b|payrolls|gdp\b|pce\b/i },
  { type: "geopolitics", pattern: /geopolit|war |sanctions/i },
  { type: "management", pattern: /\bceo\b|\bcfo\b|management change|steps down/i },
  { type: "litigation", pattern: /\blawsuit\b|litigation|class action/i },
  { type: "investigation", pattern: /\binvestigation\b|\bprobe\b|subpoena/i },
  { type: "dividend", pattern: /\bdividend\b/i },
  { type: "financing", pattern: /convertible|capital raise|credit facility/i },
  { type: "product", pattern: /product launch|unveils|next[- ]gen/i },
  { type: "partnership", pattern: /partnership|joint venture/i },
  { type: "outage", pattern: /\boutage\b|blackout|went dark/i },
];

const WHY_RE =
  /why\s+is\s+(.+?)\s+(?:down|up|moving|falling|rallying|dumping|ripping|dropping|surging)\b/i;
const WHY_RE_2 =
  /what(?:'s| is)\s+(?:moving|wrong with)\s+(.+?)(?=\s+today|\s+this session|\s+premarket|\s+after|\s*$)/i;

function whyPhrase(raw: string): string | null {
  const match = WHY_RE.exec(raw) ?? WHY_RE_2.exec(raw);
  if (!match?.[1]) return null;
  const phrase = match[1].replace(/[$?]/g, " ").replace(/\s+/g, " ").trim();
  return phrase || null;
}

function resolveWhyTicker(raw: string): string | null {
  const phrase = whyPhrase(raw);
  if (!phrase) return null;
  const alias = resolveAlias(phrase);
  if (alias) return alias;
  const fromNames = resolveQueryTickers(phrase);
  if (fromNames.length === 1) return fromNames[0]!;
  const last = phrase.split(/\s+/).pop() ?? phrase;
  const lastAlias = resolveAlias(last);
  if (lastAlias) return lastAlias;
  if (fromNames.length) return fromNames[0]!;
  return /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(last) ? last.toUpperCase() : null;
}

export function parseNewsQuery(
  raw: string,
  now = new Date(),
  session?: string | null,
): ParsedNewsQuery {
  const trimmed = raw.trim();
  const whyTicker = resolveWhyTicker(trimmed);
  const eventTypes = EVENT_ALIASES.filter((row) => row.pattern.test(trimmed)).map(
    (row) => row.type,
  );
  const validTypes = eventTypes.filter((type) =>
    (EVENT_TYPES as readonly string[]).includes(type),
  );
  const tickers = resolveQueryTickers(trimmed);
  if (whyTicker && !tickers.includes(whyTicker)) tickers.unshift(whyTicker);
  const themes = expandThemeQuery(trimmed);
  const explicitWindow = parseTimeWindow(trimmed, now);
  const whyUsesGenericToday =
    whyTicker != null &&
    (explicitWindow == null || /\btoday|this session/.test(trimmed.toLowerCase()));
  const timeRange = whyUsesGenericToday
    ? newsWindowForSession(session, now)
    : explicitWindow;
  const materialOnly = /\bmaterial\b|high[- ]impact/.test(trimmed);
  const phrase = whyPhrase(trimmed);
  const consumed = new Set(
    [
      ...tickers,
      whyTicker ?? "",
      ...themes,
      ...validTypes,
      ...(phrase?.split(/\s+/) ?? []),
      "why",
      "is",
      "down",
      "up",
      "today",
      "this",
      "week",
      "news",
      "affecting",
      "moving",
      "falling",
      "rallying",
      "contract",
      "contracts",
      "what",
      "wrong",
      "with",
      "last",
      "hour",
      "month",
      "session",
    ].map((value) => value.toLowerCase()),
  );
  const textTerms = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => {
      if (term.length <= 2) return false;
      if (consumed.has(term)) return false;
      if (term.endsWith("s") && consumed.has(term.slice(0, -1))) return false;
      for (const value of consumed) {
        if (value.length > 3 && (term.includes(value) || value.includes(term))) {
          return false;
        }
      }
      return true;
    });

  return {
    raw: trimmed,
    intent: whyTicker ? "why_moving" : "search",
    textTerms,
    tickers,
    eventTypes: validTypes,
    themes,
    sources: [],
    timeRange,
    materialOnly,
    whyTicker,
  };
}
