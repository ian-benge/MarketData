import type { CoverageSector, CoverageWatchlist } from "@/lib/watchlists/types";
import type { CoverageLink } from "./types";

export function coverageLinksFrom(
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
): CoverageLink[] {
  const map = new Map<string, CoverageLink>();
  const ensure = (ticker: string): CoverageLink => {
    const symbol = ticker.toUpperCase();
    const current = map.get(symbol);
    if (current) return current;
    const created: CoverageLink = {
      ticker: symbol,
      sectorNames: [],
      themeNames: [],
      collectionNames: [],
    };
    map.set(symbol, created);
    return created;
  };

  for (const list of lists) {
    if (list.archivedAt) continue;
    for (const ticker of list.symbols) {
      const row = ensure(ticker);
      if (!row.collectionNames.includes(list.name)) row.collectionNames.push(list.name);
    }
  }

  for (const sector of sectors) {
    if (sector.archivedAt) continue;
    for (const ticker of sector.symbols) {
      const row = ensure(ticker);
      if (sector.kind === "theme") {
        if (!row.themeNames.includes(sector.slug || sector.name)) {
          row.themeNames.push(sector.slug || sector.name);
        }
      } else if (!row.sectorNames.includes(sector.name)) {
        row.sectorNames.push(sector.name);
      }
      if (!row.collectionNames.includes(sector.name)) {
        row.collectionNames.push(sector.name);
      }
    }
  }

  return [...map.values()];
}

export function peerMapFrom(links: CoverageLink[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of links) {
    const names = new Set([...row.themeNames, ...row.sectorNames]);
    const peers = links
      .filter((other) => {
        if (other.ticker === row.ticker) return false;
        return (
          other.themeNames.some((name) => names.has(name)) ||
          other.sectorNames.some((name) => names.has(name))
        );
      })
      .map((other) => other.ticker);
    map.set(row.ticker, peers);
  }
  return map;
}
