import { listCatalogInstruments } from "@/lib/watchlists/instrument-catalog";
import {
  catalogNameFor,
  isCatalogTicker,
  isProseCapToken,
  resolveAlias,
} from "./entity-resolve";

export type TickerSuggestion = {
  ticker: string;
  name: string;
  reason: "ticker" | "name" | "alias";
};

const TICKER_TOKEN = /^[A-Z]{1,5}(?:[.-][A-Z0-9]{1,4})?$/;

let instrumentCache: Array<{ ticker: string; name: string }> | null = null;

function instruments() {
  if (!instrumentCache) instrumentCache = listCatalogInstruments();
  return instrumentCache;
}

export function normalizeTickerInput(raw: string): string | null {
  const hadDollar = raw.trim().startsWith("$");
  const trimmed = raw.trim().replace(/[$?!()]/g, "");
  if (!trimmed) return null;
  if (isProseCapToken(trimmed) && !hadDollar) return null;
  const alias = resolveAlias(trimmed);
  if (alias) return alias;
  const upper = trimmed.toUpperCase();
  if (isCatalogTicker(upper)) return upper;
  if (hadDollar && TICKER_TOKEN.test(upper) && !isProseCapToken(upper)) return upper;
  return null;
}

export function parseTickerList(raw: string): string[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const found: string[] = [];
  for (const token of tokens) {
    const ticker = normalizeTickerInput(token);
    if (ticker && !found.includes(ticker)) found.push(ticker);
  }
  return found;
}

export function queryIsTickerOnly(raw: string): boolean {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => normalizeTickerInput(token) != null);
}

export function suggestTickers(raw: string, limit = 8): TickerSuggestion[] {
  const query = raw.trim();
  if (!query) return [];
  const upper = query.replace(/[$?]/g, "").toUpperCase();
  const lower = query.toLowerCase();
  const scored: Array<TickerSuggestion & { score: number }> = [];
  const seen = new Set<string>();

  const push = (row: TickerSuggestion & { score: number }) => {
    if (seen.has(row.ticker)) return;
    seen.add(row.ticker);
    scored.push(row);
  };

  const alias = resolveAlias(query) ?? resolveAlias(upper);
  if (alias) {
    push({
      ticker: alias,
      name: catalogNameFor(alias) ?? alias,
      reason: alias === upper ? "ticker" : "alias",
      score: alias === upper ? 100 : 95,
    });
  }

  for (const row of instruments()) {
    const nameLower = row.name.toLowerCase();
    if (row.ticker === upper) {
      push({ ticker: row.ticker, name: row.name, reason: "ticker", score: 100 });
      continue;
    }
    if (upper.length >= 1 && row.ticker.startsWith(upper)) {
      push({ ticker: row.ticker, name: row.name, reason: "ticker", score: 80 });
      continue;
    }
    if (upper.length >= 2 && row.ticker.includes(upper)) {
      push({ ticker: row.ticker, name: row.name, reason: "ticker", score: 50 });
      continue;
    }
    if (nameLower.startsWith(lower)) {
      push({ ticker: row.ticker, name: row.name, reason: "name", score: 70 });
      continue;
    }
    if (lower.length >= 3 && nameLower.includes(lower)) {
      push({ ticker: row.ticker, name: row.name, reason: "name", score: 40 });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, limit)
    .map(({ ticker, name, reason }) => ({ ticker, name, reason }));
}
