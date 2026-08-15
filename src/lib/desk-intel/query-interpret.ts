import { EVENT_TYPES, type EventType, type ParsedNewsQuery } from "@/lib/intelligence/types";
import { parseNewsQuery } from "@/lib/intelligence/search-parse";
import { THEMES } from "@/lib/intelligence/themes";
import type { QueryInterpret } from "./types";

const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

export function mergeInterpretedQuery(
  raw: string,
  interpreted: QueryInterpret,
  now = new Date(),
  session?: string | null,
): ParsedNewsQuery {
  const lexical = parseNewsQuery(raw, now, session);
  const tickers = [
    ...new Set(
      [...lexical.tickers, ...interpreted.tickers.map((ticker) => ticker.toUpperCase())].filter(
        Boolean,
      ),
    ),
  ];
  const eventTypes = [
    ...new Set(
      [
        ...lexical.eventTypes,
        ...interpreted.eventTypes.filter((type): type is EventType =>
          (EVENT_TYPES as readonly string[]).includes(type),
        ),
      ],
    ),
  ];
  const themes = [
    ...new Set(
      [...lexical.themes, ...interpreted.themes.filter((theme) => THEME_IDS.has(theme))],
    ),
  ];
  const whyTicker = lexical.whyTicker ?? interpreted.whyTicker?.toUpperCase() ?? null;
  if (whyTicker && !tickers.includes(whyTicker)) tickers.unshift(whyTicker);
  return {
    ...lexical,
    intent:
      interpreted.intent === "ask"
        ? lexical.intent
        : interpreted.intent === "why_moving" || lexical.intent === "why_moving"
          ? "why_moving"
          : "search",
    tickers,
    eventTypes,
    themes,
    materialOnly: lexical.materialOnly || interpreted.materialOnly,
    textTerms:
      interpreted.textTerms.length && interpreted.textTerms.length < lexical.textTerms.length
        ? interpreted.textTerms
        : lexical.textTerms,
    whyTicker,
  };
}

export function queryLooksNatural(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 16) return false;
  if (/\?$/.test(trimmed)) return true;
  return /\b(why|what|how|affecting|impact|explain)\b/i.test(trimmed);
}
