/**
 * Firm-wide coverage symbols for the process-global refresh universe.
 * Personal lists are excluded on the live path (cache is not per-user).
 */

import { fixturesEnabled } from "@/lib/api/http";
import {
  fixtureSectorRecords,
  fixtureWatchlistRecords,
} from "@/lib/fixtures/watchlists";
import { listFirmSharedCoverage } from "@/lib/watchlists/store";
import type { CoverageSector, CoverageWatchlist } from "@/lib/watchlists/types";

export const FALLBACK_REPORT_WATCHLIST_TICKERS = [
  "SPY",
  "QQQ",
  "NVDA",
  "AAPL",
  "MSFT",
  "TLT",
] as const;

export type FirmCoverageLoad = {
  symbols: string[];
  notes: string[];
  persistence: "fixtures" | "supabase" | "unavailable";
};

function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > 16) return null;
  return symbol;
}

function roundRobinAdd(
  groups: string[][],
  add: (symbol: string) => void,
) {
  let index = 0;
  while (true) {
    let remaining = false;
    for (const group of groups) {
      if (index < group.length) remaining = true;
      const symbol = group[index];
      if (symbol) add(symbol);
    }
    if (!remaining) break;
    index += 1;
  }
}

/**
 * Priority: default watchlist → purpose=tape → kind=sector (round-robin) →
 * themes (round-robin) → other shared lists → remaining non-screen sectors.
 */
export function prioritizeCoverageSymbols(
  lists: CoverageWatchlist[],
  sectors: CoverageSector[],
  options: { includePersonal?: boolean } = {},
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const symbol = normalizeSymbol(raw);
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    out.push(symbol);
  };

  const activeLists = lists.filter((list) => {
    if (list.archivedAt) return false;
    if (list.visibility === "personal") return Boolean(options.includePersonal);
    return list.visibility === "shared";
  });
  const activeSectors = sectors.filter(
    (sector) => !sector.archivedAt && sector.kind !== "screen",
  );

  const defaultList = activeLists.find((list) => list.isDefault);
  for (const symbol of defaultList?.symbols ?? []) add(symbol);

  for (const list of activeLists) {
    if (list.purpose === "tape" && !list.isDefault) {
      for (const symbol of list.symbols) add(symbol);
    }
  }

  roundRobinAdd(
    activeSectors
      .filter((sector) => sector.kind === "sector")
      .map((sector) => sector.symbols),
    add,
  );
  roundRobinAdd(
    activeSectors
      .filter((sector) => sector.kind === "theme")
      .map((sector) => sector.symbols),
    add,
  );

  for (const list of activeLists) {
    if (list.isDefault || list.purpose === "tape") continue;
    for (const symbol of list.symbols) add(symbol);
  }

  roundRobinAdd(
    activeSectors
      .filter((sector) => sector.kind !== "sector" && sector.kind !== "theme")
      .map((sector) => sector.symbols),
    add,
  );

  return out;
}

export async function loadFirmCoverageSymbols(): Promise<FirmCoverageLoad> {
  if (fixturesEnabled()) {
    return {
      symbols: prioritizeCoverageSymbols(
        fixtureWatchlistRecords(),
        fixtureSectorRecords(),
        { includePersonal: true },
      ),
      notes: [],
      persistence: "fixtures",
    };
  }

  const loaded = await listFirmSharedCoverage();
  if (loaded.persistence === "unavailable") {
    return { symbols: [], notes: [], persistence: "unavailable" };
  }

  return {
    symbols: prioritizeCoverageSymbols(loaded.lists, loaded.sectors),
    notes: [],
    persistence: loaded.persistence === "fixtures" ? "fixtures" : "supabase",
  };
}

export async function loadDefaultSharedWatchlistTickers(): Promise<string[]> {
  const fallback = [...FALLBACK_REPORT_WATCHLIST_TICKERS];
  if (fixturesEnabled()) {
    const def = fixtureWatchlistRecords().find(
      (list) => list.isDefault && list.visibility === "shared" && !list.archivedAt,
    );
    return def?.symbols.length ? [...def.symbols] : fallback;
  }
  const loaded = await listFirmSharedCoverage();
  const def = loaded.lists.find(
    (list) => list.isDefault && list.visibility === "shared" && !list.archivedAt,
  );
  return def?.symbols.length ? [...def.symbols] : fallback;
}
