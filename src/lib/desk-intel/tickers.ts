import { tickerMentionedInText } from "@/lib/intelligence/entity-resolve";
import { isProseCapToken } from "@/lib/intelligence/entity-resolve";
import type { EvidencePack } from "./types";

const TICKER_LIKE = /\b[A-Z]{2,5}\b/g;

function packText(pack: EvidencePack): string {
  return [
    ...pack.events.map((event) => `${event.title} ${event.summary ?? ""}`),
    ...pack.sources.map((source) => source.title),
    ...pack.moves.map((move) => `${move.headline} ${move.detail}`),
  ].join(" ");
}

/** On the book, coverage, or significant tape — not merely in the instrument catalog. */
export function onDesk(ticker: string, pack: EvidencePack): boolean {
  const symbol = ticker.toUpperCase();
  if (symbol === "BOOK") return true;
  return (
    pack.inBookTickers.includes(symbol) ||
    pack.coverageTickers.includes(symbol) ||
    pack.moves.some((move) => move.ticker === symbol)
  );
}

/**
 * Theme / claim tickers: desk membership or actually mentioned in the evidence text.
 * Catalog membership alone is not enough (SPCX is a real ETF and a SpaceX overtag).
 */
export function trustedDeskTicker(
  ticker: string,
  pack: EvidencePack,
  text = packText(pack),
): boolean {
  const symbol = ticker.toUpperCase();
  if (onDesk(symbol, pack)) return true;
  if (!pack.allowedTickers.includes(symbol) && symbol !== "BOOK") return false;
  return tickerMentionedInText(symbol, text);
}

export function trustedDeskTickers(
  tickers: string[],
  pack: EvidencePack,
  text?: string,
): string[] {
  const hay = text ?? packText(pack);
  return [...new Set(tickers.filter((ticker) => trustedDeskTicker(ticker, pack, hay)))];
}

/** Strip leftover provider tags from model/rules prose without touching CPI/FOMC/AI. */
export function scrubFreeTextTickers(text: string, pack: EvidencePack): string {
  const hay = packText(pack);
  const next = text.replace(TICKER_LIKE, (token) => {
    if (isProseCapToken(token)) return token;
    if (trustedDeskTicker(token, pack, hay)) return token;
    return "";
  });
  return next
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\)/g, ")")
    .replace(/\(\s*,/g, "(")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}
