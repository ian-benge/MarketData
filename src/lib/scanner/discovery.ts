import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";
import { getEnv } from "@/lib/env";
import { MassiveClient } from "@/lib/providers/massive/client";
import { MassiveSnapshotsResponseSchema } from "@/lib/providers/massive/normalize";
import {
  fetchYahooScreenerSymbols,
  parseYahooScreenerSymbols,
} from "@/lib/market-data/earnings/yahoo";

export type DiscoveredMover = {
  ticker: string;
  source: "massive" | "yahoo" | "nasdaq";
  coverage: "full_market" | "delayed_unofficial";
};

export type DiscoveryBatch = {
  tickers: string[];
  details: DiscoveredMover[];
  notes: string[];
};

const YAHOO_SCREENERS = [
  "day_gainers",
  "day_losers",
  "most_actives",
  "small_cap_gainers",
  "aggressive_small_caps",
  "most_shorted_stocks",
] as const;

function yahooUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
}

export function mergeDiscoveredMovers(
  batches: DiscoveryBatch[],
  limit: number,
): DiscoveryBatch {
  const queues = batches.map((batch) => [...batch.details]);
  const seen = new Set<string>();
  const details: DiscoveredMover[] = [];
  const notes = batches.flatMap((batch) => batch.notes);
  let progressed = true;
  while (details.length < limit && progressed) {
    progressed = false;
    for (const queue of queues) {
      while (queue.length) {
        const row = queue.shift();
        if (!row || seen.has(row.ticker)) continue;
        seen.add(row.ticker);
        details.push(row);
        progressed = true;
        break;
      }
      if (details.length >= limit) break;
    }
  }
  return {
    tickers: details.map((row) => row.ticker),
    details,
    notes,
  };
}

export function parseNasdaqMarketMovers(raw: unknown): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const symbol =
      (typeof record.symbol === "string" && record.symbol) ||
      (typeof record.ticker === "string" && record.ticker) ||
      null;
    if (symbol) {
      const ticker = symbol.trim().toUpperCase();
      if (ticker && !seen.has(ticker) && /^[A-Z][A-Z0-9./-]{0,7}$/.test(ticker)) {
        seen.add(ticker);
        symbols.push(ticker);
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(raw);
  return symbols;
}

export async function discoverMarketMovers(limit = 120): Promise<DiscoveryBatch> {
  const [massive, nasdaq, yahooCustom, yahooSaved] = await Promise.all([
    discoverMassive(limit),
    discoverNasdaq(limit),
    discoverYahooPercentLeaders(limit),
    discoverYahooSaved(limit),
  ]);
  return mergeDiscoveredMovers([massive, nasdaq, yahooCustom, yahooSaved], limit);
}

async function discoverMassive(limit: number): Promise<DiscoveryBatch> {
  const env = getEnv();
  if (!env.MASSIVE_API_KEY) {
    return { tickers: [], details: [], notes: [] };
  }
  try {
    const client = new MassiveClient({
      apiKey: env.MASSIVE_API_KEY,
      baseUrl: env.MASSIVE_API_BASE_URL,
    });
    const tickers: string[] = [];
    const details: DiscoveredMover[] = [];
    const seen = new Set<string>();
    for (const path of [
      "/v2/snapshot/locale/us/markets/stocks/gainers",
      "/v2/snapshot/locale/us/markets/stocks/losers",
    ]) {
      const raw = await client.getJson(path);
      const parsed = MassiveSnapshotsResponseSchema.safeParse(raw);
      if (!parsed.success) continue;
      for (const row of parsed.data.tickers ?? []) {
        const ticker = row.ticker.toUpperCase();
        if (seen.has(ticker)) continue;
        seen.add(ticker);
        tickers.push(ticker);
        details.push({ ticker, source: "massive", coverage: "full_market" });
        if (tickers.length >= limit) break;
      }
      if (tickers.length >= limit) break;
    }
    return {
      tickers,
      details,
      notes: tickers.length
        ? ["Market-wide gainers/losers from Massive snapshots (not a substitute for SIP realtime)."]
        : ["Massive screener returned no tickers."],
    };
  } catch (error) {
    return {
      tickers: [],
      details: [],
      notes: [
        `Massive screener unavailable: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

async function discoverNasdaq(limit: number): Promise<DiscoveryBatch> {
  try {
    const response = await fetchWithSizeLimit(
      "https://api.nasdaq.com/api/marketmovers?assetclass=stocks",
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": yahooUserAgent(),
          origin: "https://www.nasdaq.com",
          referer: "https://www.nasdaq.com/market-activity/stocks/pre-market",
        },
        signal: AbortSignal.timeout(6_000),
        maxBytes: 800_000,
      },
    );
    if (!response.ok) {
      return {
        tickers: [],
        details: [],
        notes: [`Nasdaq movers unavailable (HTTP ${response.status}).`],
      };
    }
    const symbols = parseNasdaqMarketMovers(await response.json()).slice(0, limit);
    return {
      tickers: symbols,
      details: symbols.map((ticker) => ({
        ticker,
        source: "nasdaq",
        coverage: "delayed_unofficial",
      })),
      notes: symbols.length
        ? ["Nasdaq market-movers tables (unofficial HTML/JSON API, includes premarket when published)."]
        : ["Nasdaq movers returned no tickers."],
    };
  } catch (error) {
    return {
      tickers: [],
      details: [],
      notes: [
        `Nasdaq movers unavailable: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

async function discoverYahooPercentLeaders(limit: number): Promise<DiscoveryBatch> {
  const queries: Parameters<typeof fetchYahooScreenerSymbols>[0][] = [
    {
      size: Math.min(100, limit),
      sortField: "percentchange",
      operands: [
        { operator: "eq", operands: ["region", "us"] },
        { operator: "gte", operands: ["intradayprice", 1] },
        { operator: "lte", operands: ["intradayprice", 25] },
        { operator: "gt", operands: ["percentchange", 3] },
      ],
    },
    {
      size: Math.min(50, limit),
      sortField: "percentchange",
      operands: [
        { operator: "eq", operands: ["region", "us"] },
        { operator: "gte", operands: ["intradayprice", 1] },
        { operator: "lte", operands: ["intradayprice", 20] },
        { operator: "gt", operands: ["premarketpercentchange", 4] },
      ],
    },
  ];
  const tickers: string[] = [];
  const details: DiscoveredMover[] = [];
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const query of queries) {
    try {
      const symbols = await fetchYahooScreenerSymbols(query);
      for (const ticker of symbols) {
        if (seen.has(ticker)) continue;
        seen.add(ticker);
        tickers.push(ticker);
        details.push({ ticker, source: "yahoo", coverage: "delayed_unofficial" });
        if (tickers.length >= limit) break;
      }
    } catch {
      notes.push("Yahoo custom percent screener failed.");
    }
    if (tickers.length >= limit) break;
  }
  if (tickers.length) {
    notes.unshift(
      "Yahoo custom percent-change screener (unofficial, delayed). Used for premarket/RTH leader discovery.",
    );
  }
  return { tickers, details, notes };
}

async function discoverYahooSaved(limit: number): Promise<DiscoveryBatch> {
  const tickers: string[] = [];
  const details: DiscoveredMover[] = [];
  const seen = new Set<string>();
  const notes: string[] = [
    "Yahoo predefined screeners are delayed and unofficial — not full-market SIP coverage.",
  ];
  for (const scrId of YAHOO_SCREENERS) {
    try {
      const url = new URL("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved");
      url.searchParams.set("scrIds", scrId);
      url.searchParams.set("count", "100");
      const response = await fetchWithSizeLimit(url.toString(), {
        headers: { accept: "application/json", "user-agent": yahooUserAgent() },
        signal: AbortSignal.timeout(8_000),
        maxBytes: 800_000,
      });
      if (!response.ok) continue;
      const symbols = parseYahooScreenerSymbols(await response.json());
      for (const ticker of symbols) {
        if (seen.has(ticker)) continue;
        seen.add(ticker);
        tickers.push(ticker);
        details.push({ ticker, source: "yahoo", coverage: "delayed_unofficial" });
        if (tickers.length >= limit) break;
      }
    } catch {
      notes.push(`Yahoo screener ${scrId} failed.`);
    }
    if (tickers.length >= limit) break;
  }
  return { tickers, details, notes };
}
