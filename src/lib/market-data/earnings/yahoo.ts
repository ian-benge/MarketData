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

async function yahooRequest(
  url: string,
  cookies: string,
): Promise<Response> {
  return fetchWithSizeLimit(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": USER_AGENT,
      ...(cookies ? { cookie: cookies } : {}),
    },
    signal: AbortSignal.timeout(12_000),
    maxBytes: 1_200_000,
  });
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

export async function fetchYahooEquityQuotes(
  symbols: string[],
): Promise<Map<string, YahooEquityQuote>> {
  const requested = [...new Set(symbols.map((item) => item.trim()).filter(Boolean))];
  const yahooByRequest = new Map<string, string>();
  for (const symbol of requested) {
    yahooByRequest.set(symbol, toYahooSymbol(symbol));
  }
  const uniqueYahoo = [...new Set(yahooByRequest.values())];
  const byYahoo = new Map<string, YahooEquityQuote>();
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueYahoo.length; index += 20) {
    chunks.push(uniqueYahoo.slice(index, index + 20));
  }
  await withSession(async (active) => {
    let cursor = 0;
    async function worker() {
      while (cursor < chunks.length) {
        const index = cursor;
        cursor += 1;
        const chunk = chunks[index]!;
        const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
        url.searchParams.set("symbols", chunk.join(","));
        url.searchParams.set("crumb", active.crumb);
        const response = await yahooRequest(url.toString(), active.cookies);
        if (!response.ok) continue;
        for (const quote of parseYahooQuoteBatch(await response.json())) {
          byYahoo.set(quote.symbol.toUpperCase(), quote);
          const canonical = toCanonicalSymbol(quote.symbol);
          if (canonical) byYahoo.set(canonical, quote);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, chunks.length) || 0 }, () => worker()));
  });
  const quotes = new Map<string, YahooEquityQuote>();
  for (const symbol of requested) {
    const yahoo = yahooByRequest.get(symbol)!;
    const quote =
      byYahoo.get(toCanonicalSymbol(symbol) ?? symbol.toUpperCase()) ??
      byYahoo.get(yahoo);
    if (quote) {
      quotes.set(toCanonicalSymbol(symbol) ?? symbol.toUpperCase(), quote);
      quotes.set(yahoo, quote);
    }
  }
  return quotes;
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

export async function fetchYahooSparkDailyCloses(
  symbols: string[],
  range = "1mo",
): Promise<Map<string, DailyClose[]>> {
  const out = new Map<string, DailyClose[]>();
  const unique = [...new Set(symbols.map((item) => toYahooSymbol(item)).filter(Boolean))];
  if (!unique.length) return out;
  return withSession(async (active) => {
    const chunks: string[][] = [];
    for (let index = 0; index < unique.length; index += 10) {
      chunks.push(unique.slice(index, index + 10));
    }
    let cursor = 0;
    async function worker() {
      while (cursor < chunks.length) {
        const index = cursor;
        cursor += 1;
        const chunk = chunks[index]!;
        const url = new URL("https://query1.finance.yahoo.com/v8/finance/spark");
        url.searchParams.set("symbols", chunk.join(","));
        url.searchParams.set("interval", "1d");
        url.searchParams.set("range", range);
        url.searchParams.set("crumb", active.crumb);
        const response = await yahooRequest(url.toString(), active.cookies);
        if (!response.ok) continue;
        for (const [symbol, closes] of parseYahooSparkDailyCloses(await response.json())) {
          out.set(symbol, closes);
          const canonical = toCanonicalSymbol(symbol);
          if (canonical) out.set(canonical, closes);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, chunks.length) || 0 }, () => worker()),
    );
    return out;
  });
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
