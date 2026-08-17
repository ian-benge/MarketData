import { z } from "zod";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";
import { parseYahooDailyCloses } from "@/lib/market-data/earnings/history-parse";
import type { DailyClose } from "@/lib/market-data/earnings/history-types";
import { toCanonicalSymbol, toYahooSymbol } from "@/lib/market-data/earnings/symbols";
import type {
  YahooEquityQuote,
  YahooOptionChain,
  YahooOptionContract,
} from "@/lib/market-data/earnings/types";
import {
  YAHOO_CHUNK_CONCURRENCY,
  YAHOO_QUOTE_CHUNK_SIZE,
  YAHOO_SPARK_CHUNK_SIZE,
  chunkList,
  diagnoseYahooSymbols,
  isRetryableYahooStatus,
  mapYahooChunks,
  type YahooChunkFailure,
  type YahooSymbolDiagnostic,
} from "@/lib/market-data/earnings/yahoo-batch";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const SESSION_TTL_MS = 25 * 60 * 1000;

type YahooSession = {
  cookies: string;
  crumb: string;
  expiresAt: number;
};

let session: YahooSession | null = null;

const QuoteRowSchema = z
  .object({
    symbol: z.string(),
    quoteType: z.string().optional(),
    shortName: z.string().optional(),
    longName: z.string().optional(),
    displayName: z.string().optional(),
    regularMarketPrice: z.number().optional(),
    marketCap: z.number().optional(),
    averageDailyVolume10Day: z.number().optional(),
    averageDailyVolume3Month: z.number().optional(),
  })
  .passthrough();

const ContractSchema = z
  .object({
    strike: z.number(),
    bid: z.number().nullable().optional(),
    ask: z.number().nullable().optional(),
    lastPrice: z.number().nullable().optional(),
    impliedVolatility: z.number().nullable().optional(),
  })
  .passthrough();

function mergeCookies(existing: string, setCookies: string[]): string {
  const map = new Map<string, string>();
  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const header of setCookies) {
    const pair = header.split(";")[0]?.trim() ?? "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    map.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...map.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

export type YahooFetchDeps = {
  request?: (url: string, cookies: string) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
};

export type YahooQuoteFetchResult = {
  quotes: Map<string, YahooEquityQuote>;
  diagnostics: YahooSymbolDiagnostic[];
  failures: YahooChunkFailure[];
};

export type YahooSparkFetchResult = {
  closes: Map<string, DailyClose[]>;
  diagnostics: YahooSymbolDiagnostic[];
  failures: YahooChunkFailure[];
};

async function yahooRequest(
  url: string,
  cookies: string,
  maxBytes = 2_000_000,
): Promise<Response> {
  return fetchWithSizeLimit(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": USER_AGENT,
      ...(cookies ? { cookie: cookies } : {}),
    },
    signal: AbortSignal.timeout(12_000),
    maxBytes,
  });
}

function chunkErrorMessage(status: number | null, fallback: string) {
  if (status === 429) return "Quote provider rate-limited this batch.";
  if (status != null && status >= 500) return `Quote provider error HTTP ${status}.`;
  if (status != null && status >= 400) return `Quote provider rejected this batch (HTTP ${status}).`;
  return fallback;
}

function indexYahooQuotes(quotes: YahooEquityQuote[]) {
  const byYahoo = new Map<string, YahooEquityQuote>();
  for (const quote of quotes) {
    byYahoo.set(quote.symbol.toUpperCase(), quote);
    const canonical = toCanonicalSymbol(quote.symbol);
    if (canonical) byYahoo.set(canonical, quote);
  }
  return byYahoo;
}

function resolveRequestedQuotes(
  requested: string[],
  yahooByRequest: Map<string, string>,
  byYahoo: Map<string, YahooEquityQuote>,
) {
  const quotes = new Map<string, YahooEquityQuote>();
  for (const symbol of requested) {
    const yahoo = yahooByRequest.get(symbol)!;
    const quote =
      byYahoo.get(toCanonicalSymbol(symbol) ?? symbol.toUpperCase()) ??
      byYahoo.get(yahoo);
    if (quote) {
      quotes.set(toCanonicalSymbol(symbol) ?? symbol.toUpperCase(), quote);
      quotes.set(yahoo, quote);
      quotes.set(symbol.trim().toUpperCase(), quote);
    }
  }
  return quotes;
}

async function createSession(): Promise<YahooSession> {
  let cookies = "";
  try {
    const warm = await yahooRequest("https://fc.yahoo.com/", cookies);
    cookies = mergeCookies(cookies, readSetCookies(warm));
  } catch {
    /* handshake host may 404; cookies still matter */
  }
  const crumbRes = await yahooRequest(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    cookies,
  );
  cookies = mergeCookies(cookies, readSetCookies(crumbRes));
  const crumb = (await crumbRes.text()).replaceAll('"', "").trim();
  if (!crumb || crumb.length > 80 || crumb.startsWith("{")) {
    throw new Error("Yahoo crumb handshake failed");
  }
  return {
    cookies,
    crumb,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

async function withSession<T>(
  run: (active: YahooSession) => Promise<T>,
): Promise<T> {
  if (!session || session.expiresAt <= Date.now()) {
    session = await createSession();
  }
  try {
    return await run(session);
  } catch {
    session = await createSession();
    return run(session);
  }
}

export function quoteFromYahooRow(raw: unknown): YahooEquityQuote | null {
  const parsed = QuoteRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  const extra =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : row;
  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    symbol: row.symbol.toUpperCase(),
    name: row.displayName ?? row.shortName ?? row.longName ?? null,
    price: num(row.regularMarketPrice),
    marketCap: num(row.marketCap),
    avgVolume:
      row.averageDailyVolume10Day ?? row.averageDailyVolume3Month ?? null,
    quoteType: row.quoteType ?? null,
    changePercent: num(extra.regularMarketChangePercent),
    open: num(extra.regularMarketOpen),
    volume: num(extra.regularMarketVolume),
    previousClose: num(extra.regularMarketPreviousClose),
    dayHigh: num(extra.regularMarketDayHigh),
    dayLow: num(extra.regularMarketDayLow),
    preMarketChangePercent: num(extra.preMarketChangePercent),
    postMarketChangePercent: num(extra.postMarketChangePercent),
  };
}

export function parseYahooQuoteBatch(raw: unknown): YahooEquityQuote[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const response = record?.quoteResponse as { result?: unknown } | undefined;
  const rows = Array.isArray(response?.result) ? response.result : [];
  return rows
    .map(quoteFromYahooRow)
    .filter((row): row is YahooEquityQuote => row != null);
}

function contractsFrom(raw: unknown): YahooOptionContract[] {
  if (!Array.isArray(raw)) return [];
  const out: YahooOptionContract[] = [];
  for (const item of raw) {
    const parsed = ContractSchema.safeParse(item);
    if (!parsed.success) continue;
    out.push({
      strike: parsed.data.strike,
      bid: parsed.data.bid ?? null,
      ask: parsed.data.ask ?? null,
      last: parsed.data.lastPrice ?? null,
      impliedVolatility: parsed.data.impliedVolatility ?? null,
    });
  }
  return out;
}

export function parseYahooOptionChain(raw: unknown): YahooOptionChain | null {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const chain = record?.optionChain as { result?: unknown[] } | undefined;
  const first = chain?.result?.[0];
  if (!first || typeof first !== "object") return null;
  const row = first as Record<string, unknown>;
  const quote = quoteFromYahooRow(row.quote);
  if (!quote) return null;
  const expirations = Array.isArray(row.expirationDates)
    ? row.expirationDates.filter((value): value is number => typeof value === "number")
    : [];
  const option = Array.isArray(row.options) ? row.options[0] : null;
  const optionRow =
    option && typeof option === "object" ? (option as Record<string, unknown>) : null;
  return {
    symbol: quote.symbol,
    quote,
    expirationDates: expirations,
    calls: contractsFrom(optionRow?.calls),
    puts: contractsFrom(optionRow?.puts),
    expiration:
      typeof optionRow?.expirationDate === "number" ? optionRow.expirationDate : null,
  };
}

export async function fetchYahooEquityQuotesDetailed(
  symbols: string[],
  deps: YahooFetchDeps = {},
): Promise<YahooQuoteFetchResult> {
  const requested = [...new Set(symbols.map((item) => item.trim()).filter(Boolean))];
  const yahooByRequest = new Map<string, string>();
  for (const symbol of requested) {
    yahooByRequest.set(symbol, toYahooSymbol(symbol));
  }
  const uniqueYahoo = [...new Set(yahooByRequest.values())];
  if (!uniqueYahoo.length) {
    return { quotes: new Map(), diagnostics: [], failures: [] };
  }
  const request = deps.request ?? yahooRequest;
  const byYahoo = new Map<string, YahooEquityQuote>();
  const { values, failures } = await withSession(async (active) =>
    mapYahooChunks({
      chunks: chunkList(uniqueYahoo, YAHOO_QUOTE_CHUNK_SIZE),
      concurrency: YAHOO_CHUNK_CONCURRENCY,
      sleep: deps.sleep,
      load: async (chunk) => {
        const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
        url.searchParams.set("symbols", chunk.join(","));
        url.searchParams.set("crumb", active.crumb);
        try {
          const response = await request(url.toString(), active.cookies);
          if (isRetryableYahooStatus(response.status)) {
            return {
              ok: false,
              status: response.status,
              message: chunkErrorMessage(response.status, "Quote batch failed."),
              retryable: true,
            };
          }
          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              message: chunkErrorMessage(response.status, "Quote batch failed."),
              retryable: false,
            };
          }
          return { ok: true, value: parseYahooQuoteBatch(await response.json()) };
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Yahoo quote chunk failed.";
          return {
            ok: false,
            status: null,
            message: message.slice(0, 240),
            retryable: true,
            split: /exceeds size limit/i.test(message) && chunk.length > 1,
          };
        }
      },
    }),
  );
  for (const rows of values) {
    for (const [key, quote] of indexYahooQuotes(rows)) byYahoo.set(key, quote);
  }
  const quotes = resolveRequestedQuotes(requested, yahooByRequest, byYahoo);
  return {
    quotes,
    failures,
    diagnostics: diagnoseYahooSymbols({
      requested,
      received: quotes.keys(),
      failures,
      yahooSymbolFor: toYahooSymbol,
    }),
  };
}

export async function fetchYahooEquityQuotes(
  symbols: string[],
  deps: YahooFetchDeps = {},
): Promise<Map<string, YahooEquityQuote>> {
  return (await fetchYahooEquityQuotesDetailed(symbols, deps)).quotes;
}

export async function fetchYahooOptionChain(
  symbol: string,
  expirationUnix?: number,
): Promise<YahooOptionChain | null> {
  return withSession(async (active) => {
    const url = new URL(
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`,
    );
    url.searchParams.set("crumb", active.crumb);
    if (expirationUnix != null) {
      url.searchParams.set("date", String(expirationUnix));
    }
    const response = await yahooRequest(url.toString(), active.cookies);
    if (!response.ok) return null;
    return parseYahooOptionChain(await response.json());
  });
}

function closesFromTimestampClose(
  timestamps: unknown,
  closes: unknown,
): DailyClose[] {
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return [];
  const out: DailyClose[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const stamp = timestamps[index];
    const close = closes[index];
    if (typeof stamp !== "number" || typeof close !== "number" || !Number.isFinite(close)) {
      continue;
    }
    out.push({
      date: new Date(stamp * 1000).toISOString().slice(0, 10),
      close,
    });
  }
  return out;
}

export function parseYahooSparkDailyCloses(raw: unknown): Map<string, DailyClose[]> {
  const out = new Map<string, DailyClose[]>();
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!record) return out;

  const spark = record.spark as { result?: unknown[] } | undefined;
  const rows = Array.isArray(spark?.result) ? spark.result : [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const symbol = typeof row.symbol === "string" ? row.symbol.toUpperCase() : null;
    const responses = Array.isArray(row.response) ? row.response : [row];
    for (const response of responses) {
      if (!response || typeof response !== "object") continue;
      const payload = response as Record<string, unknown>;
      const chartCloses = parseYahooDailyCloses({ chart: { result: [payload] } });
      const flatCloses = closesFromTimestampClose(
        payload.timestamp,
        payload.close ??
          (payload.indicators as { quote?: Array<{ close?: unknown }> } | undefined)?.quote?.[0]
            ?.close,
      );
      const closes = chartCloses.length ? chartCloses : flatCloses;
      if (!symbol || !closes.length) continue;
      out.set(symbol, closes);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "spark" || !value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const symbol = (typeof row.symbol === "string" ? row.symbol : key).toUpperCase();
    const closes = closesFromTimestampClose(row.timestamp, row.close);
    if (closes.length) out.set(symbol, closes);
  }
  return out;
}

export async function fetchYahooSparkDailyClosesDetailed(
  symbols: string[],
  range = "1mo",
  deps: YahooFetchDeps = {},
): Promise<YahooSparkFetchResult> {
  const requested = [...new Set(symbols.map((item) => item.trim()).filter(Boolean))];
  const unique = [...new Set(requested.map((item) => toYahooSymbol(item)).filter(Boolean))];
  if (!unique.length) {
    return { closes: new Map(), diagnostics: [], failures: [] };
  }
  const request = deps.request ?? yahooRequest;
  const out = new Map<string, DailyClose[]>();
  const { values, failures } = await withSession(async (active) =>
    mapYahooChunks({
      chunks: chunkList(unique, YAHOO_SPARK_CHUNK_SIZE),
      concurrency: YAHOO_CHUNK_CONCURRENCY,
      sleep: deps.sleep,
      load: async (chunk) => {
        const url = new URL("https://query1.finance.yahoo.com/v8/finance/spark");
        url.searchParams.set("symbols", chunk.join(","));
        url.searchParams.set("interval", "1d");
        url.searchParams.set("range", range);
        url.searchParams.set("crumb", active.crumb);
        try {
          const response = await request(url.toString(), active.cookies);
          if (isRetryableYahooStatus(response.status)) {
            return {
              ok: false,
              status: response.status,
              message: chunkErrorMessage(response.status, "History batch failed."),
              retryable: true,
            };
          }
          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              message: chunkErrorMessage(response.status, "History batch failed."),
              retryable: false,
            };
          }
          return { ok: true, value: parseYahooSparkDailyCloses(await response.json()) };
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Yahoo spark chunk failed.";
          return {
            ok: false,
            status: null,
            message: message.slice(0, 240),
            retryable: true,
            split: /exceeds size limit/i.test(message) && chunk.length > 1,
          };
        }
      },
    }),
  );
  for (const batch of values) {
    for (const [symbol, closes] of batch) {
      out.set(symbol, closes);
      const canonical = toCanonicalSymbol(symbol);
      if (canonical) out.set(canonical, closes);
    }
  }
  return {
    closes: out,
    failures,
    diagnostics: diagnoseYahooSymbols({
      requested,
      received: out.keys(),
      failures,
      yahooSymbolFor: toYahooSymbol,
    }),
  };
}

export async function fetchYahooSparkDailyCloses(
  symbols: string[],
  range = "1mo",
  deps: YahooFetchDeps = {},
): Promise<Map<string, DailyClose[]>> {
  return (await fetchYahooSparkDailyClosesDetailed(symbols, range, deps)).closes;
}

export async function fetchYahooDailyCloses(
  symbol: string,
  range = "2y",
): Promise<DailyClose[]> {
  return withSession(async (active) => {
    const url = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}`,
    );
    url.searchParams.set("interval", "1d");
    url.searchParams.set("range", range);
    url.searchParams.set("crumb", active.crumb);
    const response = await fetchWithSizeLimit(url.toString(), {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": USER_AGENT,
        cookie: active.cookies,
      },
      signal: AbortSignal.timeout(15_000),
      maxBytes: 2_000_000,
    });
    if (!response.ok) {
      throw new Error(`Yahoo daily bars failed: HTTP ${response.status}`);
    }
    return parseYahooDailyCloses(await response.json());
  });
}

export function resetYahooEarningsSession() {
  session = null;
}
