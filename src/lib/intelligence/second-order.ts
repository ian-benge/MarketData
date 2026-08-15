import { THEMES, themesFromText } from "./themes";
import type { CoverageLink, ResolvedEntity } from "./types";
import { catalogNameFor } from "./entity-resolve";

export function themesForEvent(
  title: string,
  summary: string | undefined,
  tickers: string[],
  coverage: CoverageLink[],
): { themes: string[]; sectors: string[] } {
  const textThemes = themesFromText(`${title} ${summary ?? ""}`);
  const sectors = new Set<string>();
  const themes = new Set(textThemes);
  const tickerSet = new Set(tickers);
  for (const row of coverage) {
    if (!tickerSet.has(row.ticker)) continue;
    for (const name of row.themeNames) themes.add(name);
    for (const name of row.sectorNames) sectors.add(name);
  }
  return { themes: [...themes], sectors: [...sectors] };
}

export function secondOrderEntities(
  eventTickers: string[],
  themes: string[],
  coverage: CoverageLink[],
  limit = 6,
): ResolvedEntity[] {
  const primary = new Set(eventTickers);
  const candidates = new Map<string, ResolvedEntity>();

  for (const themeId of themes) {
    const theme = THEMES.find((row) => row.id === themeId);
    for (const ticker of theme?.relatedTickers ?? []) {
      if (primary.has(ticker) || candidates.has(ticker)) continue;
      candidates.set(ticker, {
        ticker,
        name: catalogNameFor(ticker),
        role: "second_order",
        confidence: "low",
        method: "theme_peer",
      });
    }
  }

  for (const row of coverage) {
    if (primary.has(row.ticker) || candidates.has(row.ticker)) continue;
    const overlap = row.themeNames.some((name) => themes.includes(name));
    if (!overlap) continue;
    candidates.set(row.ticker, {
      ticker: row.ticker,
      name: catalogNameFor(row.ticker) ?? row.ticker,
      role: "second_order",
      confidence: "low",
      method: "theme_peer",
    });
  }

  return [...candidates.values()].slice(0, limit);
}

export function peerTickersFor(
  ticker: string,
  coverage: CoverageLink[],
): string[] {
  const row = coverage.find((item) => item.ticker === ticker);
  if (!row) return [];
  const names = new Set([...row.themeNames, ...row.sectorNames]);
  return coverage
    .filter((item) => {
      if (item.ticker === ticker) return false;
      return (
        item.themeNames.some((name) => names.has(name)) ||
        item.sectorNames.some((name) => names.has(name))
      );
    })
    .map((item) => item.ticker);
}
