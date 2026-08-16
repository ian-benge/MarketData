/**
 * Provider-specific ticker conversion.
 *
 * Canonical form uses a dot for share-class suffixes (BRK.B, BF.B).
 * Yahoo Finance uses a hyphen (BRK-B). Finnhub and Alpha Vantage typically
 * use the dotted form. Never mutate a stored canonical ticker just to satisfy
 * Yahoo — convert at the call site instead.
 *
 * A failed conversion returns the trimmed uppercase input. Callers must not
 * drop the earnings event solely because a mapping is imperfect.
 */

const SHARE_CLASS = /^([A-Z][A-Z0-9]{0,5})[.\-\/]([A-Z]{1,2})$/;
const EXCHANGE_PREFIX = /^(US|NASDAQ|NYSE|AMEX|ARCA|BATS|OTC|PINK):/;

export function toCanonicalSymbol(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toUpperCase().replace(EXCHANGE_PREFIX, "");
  if (!trimmed) return null;
  const share = SHARE_CLASS.exec(trimmed);
  if (share) return `${share[1]}.${share[2]}`;
  return trimmed.replaceAll("/", ".");
}

export function toFinnhubSymbol(canonicalSymbol: string): string {
  return toCanonicalSymbol(canonicalSymbol) ?? canonicalSymbol.trim().toUpperCase();
}

export function toAlphaVantageSymbol(canonicalSymbol: string): string {
  return toCanonicalSymbol(canonicalSymbol) ?? canonicalSymbol.trim().toUpperCase();
}

/** Yahoo share-class tickers use a hyphen: BRK.B → BRK-B. */
export function toYahooSymbol(canonicalSymbol: string): string {
  const canonical =
    toCanonicalSymbol(canonicalSymbol) ?? canonicalSymbol.trim().toUpperCase();
  const share = SHARE_CLASS.exec(canonical);
  if (share) return `${share[1]}-${share[2]}`;
  return canonical;
}

export function looksLikeListedTicker(symbol: string): boolean {
  const canonical = toCanonicalSymbol(symbol);
  if (!canonical) return false;
  return /^[A-Z][A-Z0-9.]{0,9}$/.test(canonical);
}
