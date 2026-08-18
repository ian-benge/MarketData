import { AI_INFRASTRUCTURE_TICKERS, SECTOR_ETFS } from "@/lib/market-data/universe";

export const SCANNER_THEME_UNIVERSE: Record<string, readonly string[]> = {
  semiconductors: [
    "NVDA",
    "AMD",
    "AVGO",
    "TSM",
    "INTC",
    "MU",
    "AMAT",
    "LRCX",
    "KLAC",
    "ASML",
    "ARM",
    "SMCI",
    "MRVL",
    "ADI",
    "TXN",
    "SNPS",
    "CDNS",
  ],
  photonics: ["COHR", "LITE", "AAOI", "CIEN", "FN", "ALAB", "CRDO", "ANET"],
  hyperscalers: ["MSFT", "GOOGL", "AMZN", "META", "ORCL", "AAPL"],
  datacenter: ["EQIX", "DLR", "VRT", "SMCI", "ANET", "CSCO", "IRM"],
  power: ["CEG", "VST", "NEE", "SMR", "OKLO", "CTRA", "LNG", "GEV", "PWR", "ETN"],
  ai_software: ["PLTR", "CRWD", "SNOW", "DDOG", "NET", "PATH", "NOW", "MSFT"],
  thematic_etfs: ["SMH", "SOXX", "XLK", "BOTZ", "GRID", "URNM", "QQQ", "SPY", "IWM"],
};

export const SCANNER_THEME_BY_TICKER: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [theme, symbols] of Object.entries(SCANNER_THEME_UNIVERSE)) {
    for (const symbol of symbols) {
      const list = map[symbol] ?? [];
      if (!list.includes(theme)) list.push(theme);
      map[symbol] = list;
    }
  }
  return map;
})();

export type ScannerUniverseInput = {
  maxSize: number;
  coverageSymbols?: readonly string[];
  positionSymbols?: readonly string[];
  discoveredSymbols?: readonly string[];
  priorAlertSymbols?: readonly string[];
  themeSymbols?: readonly string[];
};

export type ScannerUniverseResult = {
  symbols: string[];
  sources: Record<string, string[]>;
  notes: string[];
  maxSize: number;
};

function normalize(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > 16) return null;
  return symbol;
}

function addAll(
  list: readonly string[] | undefined,
  seen: Set<string>,
  out: string[],
  bucket: string[],
) {
  for (const raw of list ?? []) {
    const symbol = normalize(raw);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    bucket.push(symbol);
  }
}

/**
 * Scanner universe is independent of the dashboard 80-name tape.
 * Priority: positions → coverage → discovered movers → prior alerts → themes.
 */
export function buildScannerUniverse(input: ScannerUniverseInput): ScannerUniverseResult {
  const seen = new Set<string>();
  const symbols: string[] = [];
  const sources: Record<string, string[]> = {
    positions: [],
    coverage: [],
    discovered: [],
    prior_alerts: [],
    themes: [],
    benchmarks: [],
  };
  const notes: string[] = [];

  addAll(input.positionSymbols, seen, symbols, sources.positions!);
  addAll(input.coverageSymbols, seen, symbols, sources.coverage!);
  addAll(input.discoveredSymbols, seen, symbols, sources.discovered!);
  addAll(input.priorAlertSymbols, seen, symbols, sources.prior_alerts!);

  const themeDefault = [
    ...AI_INFRASTRUCTURE_TICKERS,
    ...SECTOR_ETFS,
    ...Object.values(SCANNER_THEME_UNIVERSE).flat(),
  ];
  addAll(input.themeSymbols ?? themeDefault, seen, symbols, sources.themes!);
  addAll(["SPY", "QQQ", "IWM", "SMH"], seen, symbols, sources.benchmarks!);

  if (symbols.length > input.maxSize) {
    notes.push(
      `Scanner universe truncated from ${symbols.length} to ${input.maxSize}. Discovered movers and coverage keep priority.`,
    );
  }

  return {
    symbols: symbols.slice(0, input.maxSize),
    sources,
    notes,
    maxSize: input.maxSize,
  };
}
