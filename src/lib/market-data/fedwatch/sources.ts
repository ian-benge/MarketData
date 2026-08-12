import { z } from "zod";
import type { Env } from "@/lib/env";
import {
  monthKey,
  monthsForMeetings,
  parseYahooZqSymbol,
  yahooZqSymbol,
} from "@/lib/market-data/fedwatch/fomc";
import type { ZqContractSeries } from "@/lib/market-data/fedwatch/compare";
import type {
  FedFundsQuote,
  FedWatchBin,
  FedWatchMeeting,
  TargetContext,
} from "@/lib/market-data/fedwatch/types";
import { classifyBin, rangeLabel } from "@/lib/market-data/fedwatch/calc";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const NY_FED_EFFR_URL =
  "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";

const CME_SETTLEMENTS_URL =
  "https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/305/FUT";

const CME_API_HOSTS = new Set(["markets.api.cmegroup.com"]);

const YahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z
            .object({
              regularMarketPrice: z.number().optional(),
              regularMarketVolume: z.number().optional(),
              chartPreviousClose: z.number().optional(),
              symbol: z.string().optional(),
            })
            .optional(),
          timestamp: z.array(z.number()).optional(),
          indicators: z
            .object({
              quote: z
                .array(
                  z.object({
                    close: z.array(z.number().nullable()).optional(),
                    volume: z.array(z.number().nullable()).optional(),
                  }),
                )
                .optional(),
            })
            .optional(),
        }),
      )
      .nullable()
      .optional(),
    error: z.unknown().optional(),
  }),
});

const NyFedSchema = z.object({
  refRates: z
    .array(
      z.object({
        effectiveDate: z.string(),
        percentRate: z.number(),
        targetRateFrom: z.number(),
        targetRateTo: z.number(),
      }),
    )
    .min(1),
});

const CmeSettlementRowSchema = z.object({
  month: z.string(),
  settle: z.string().optional(),
  volume: z.string().optional(),
  openInterest: z.string().optional(),
});

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number; maxBytes?: number } = {},
): Promise<unknown> {
  const { timeoutMs = 12_000, maxBytes = 400_000, ...rest } = init;
  const res = await fetchWithSizeLimit(url, {
    ...rest,
    maxBytes,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json,text/csv,*/*",
      "user-agent": USER_AGENT,
      ...rest.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  }
  return res.json();
}

function parseMonthToken(token: string): { year: number; month: number } | null {
  const match = /^([A-Z]{3})\s+(\d{2})$/.exec(token.trim().toUpperCase());
  if (!match) return null;
  const months: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };
  const month = months[match[1] ?? ""];
  if (!month) return null;
  const yy = Number(match[2]);
  return { year: yy >= 70 ? 1900 + yy : 2000 + yy, month };
}

function parseLooseNumber(value: string | undefined): number | null {
  if (!value || value === "-" || value === ".") return null;
  const n = Number(value.replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

export async function fetchNyFedTarget(): Promise<TargetContext> {
  const raw = await fetchJson(NY_FED_EFFR_URL, { timeoutMs: 10_000 });
  const parsed = NyFedSchema.parse(raw);
  const latest = parsed.refRates[0]!;
  return {
    effr: latest.percentRate,
    effrAsOf: latest.effectiveDate,
    lowerPct: latest.targetRateFrom,
    upperPct: latest.targetRateTo,
  };
}

export async function fetchYahooZqSeries(
  meetingIsos: string[],
): Promise<ZqContractSeries[]> {
  const months = monthsForMeetings(meetingIsos);
  const series: ZqContractSeries[] = [];

  const tasks = months.map(async ({ year, month }) => {
    const symbol = yahooZqSymbol(year, month);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2mo`;
    try {
      const raw = await fetchJson(url, { timeoutMs: 12_000 });
      const parsed = YahooChartSchema.parse(raw);
      const result = parsed.chart.result?.[0];
      const price = result?.meta?.regularMarketPrice;
      if (price == null || !Number.isFinite(price)) return;
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const volumes = result?.indicators?.quote?.[0]?.volume ?? [];
      const daily = (result?.timestamp ?? []).flatMap((stamp, index) => {
        const close = closes[index];
        if (close == null || !Number.isFinite(close)) return [];
        return [
          {
            date: new Date(stamp * 1000).toISOString().slice(0, 10),
            close,
            volume: volumes[index] ?? null,
          },
        ];
      });
      series.push({
        year,
        month,
        monthKey: monthKey(year, month),
        last: price,
        volume: result?.meta?.regularMarketVolume ?? null,
        daily,
      });
    } catch {
      /* skip missing / expired contracts */
    }
  });

  await Promise.all(tasks);
  return series;
}

export async function fetchYahooZqQuotes(
  meetingIsos: string[],
): Promise<FedFundsQuote[]> {
  const series = await fetchYahooZqSeries(meetingIsos);
  return series.map((contract) => ({
    monthKey: contract.monthKey,
    year: contract.year,
    month: contract.month,
    price: contract.last,
    volume: contract.volume,
    openInterest: null,
  }));
}

const SparkContractSchema = z
  .object({
    symbol: z.string().optional(),
    close: z.array(z.number().nullable()).optional(),
    timestamp: z.array(z.number()).optional(),
    previousClose: z.number().optional(),
  })
  .passthrough();

function lastFinite(
  values: Array<number | null | undefined>,
): { value: number; index: number } | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value != null && Number.isFinite(value)) {
      return { value, index };
    }
  }
  return null;
}

function quoteFromSpark(
  symbol: string,
  contract: z.infer<typeof SparkContractSchema>,
): FedFundsQuote | null {
  const parsed = parseYahooZqSymbol(contract.symbol ?? symbol);
  const last = lastFinite(contract.close ?? []);
  if (!parsed || !last) return null;
  const stamp = contract.timestamp?.[last.index];
  return {
    monthKey: monthKey(parsed.year, parsed.month),
    year: parsed.year,
    month: parsed.month,
    price: Math.round(last.value * 10000) / 10000,
    volume: null,
    openInterest: null,
    tradedAt:
      stamp != null && Number.isFinite(stamp)
        ? new Date(stamp * 1000).toISOString()
        : null,
  };
}

export function parseYahooSparkQuotes(raw: unknown): FedFundsQuote[] {
  const quotes: FedFundsQuote[] = [];
  const seen = new Set<string>();
  const add = (quote: FedFundsQuote | null) => {
    if (!quote) return;
    const key = `${quote.year}-${quote.month}`;
    if (seen.has(key)) return;
    seen.add(key);
    quotes.push(quote);
  };

  const record = asRecord(raw);
  if (!record) return quotes;

  const spark = asRecord(record.spark);
  const result = spark?.result;
  if (Array.isArray(result)) {
    for (const item of result) {
      const row = asRecord(item);
      if (!row) continue;
      const symbol =
        typeof row.symbol === "string"
          ? row.symbol
          : typeof item === "object" && item && "symbol" in item
            ? String((item as { symbol?: string }).symbol ?? "")
            : "";
      const responses = Array.isArray(row.response) ? row.response : [row];
      for (const response of responses) {
        const parsed = SparkContractSchema.safeParse(response);
        if (!parsed.success) continue;
        add(quoteFromSpark(symbol, parsed.data));
      }
    }
  }

  for (const [symbol, value] of Object.entries(record)) {
    if (symbol === "spark") continue;
    const parsed = SparkContractSchema.safeParse(value);
    if (!parsed.success) continue;
    add(quoteFromSpark(symbol, parsed.data));
  }

  return quotes;
}

export function mergeFedFundsQuotes(
  ...groups: FedFundsQuote[][]
): FedFundsQuote[] {
  const byMonth = new Map<string, FedFundsQuote>();
  for (const group of groups) {
    for (const quote of group) {
      const key = `${quote.year}-${quote.month}`;
      const prior = byMonth.get(key);
      byMonth.set(key, {
        monthKey: quote.monthKey || prior?.monthKey || monthKey(quote.year, quote.month),
        year: quote.year,
        month: quote.month,
        price: quote.price,
        volume: quote.volume ?? prior?.volume ?? null,
        openInterest: quote.openInterest ?? prior?.openInterest ?? null,
        tradedAt: quote.tradedAt ?? prior?.tradedAt ?? null,
      });
    }
  }
  return [...byMonth.values()];
}

export function attachSettlementStats(
  quotes: FedFundsQuote[],
  settlements: FedFundsQuote[],
): FedFundsQuote[] {
  if (!settlements.length) return quotes;
  const byMonth = new Map(
    settlements.map((row) => [`${row.year}-${row.month}`, row] as const),
  );
  return quotes.map((quote) => {
    const settle = byMonth.get(`${quote.year}-${quote.month}`);
    if (!settle) return quote;
    return {
      ...quote,
      volume: quote.volume ?? settle.volume,
      openInterest: quote.openInterest ?? settle.openInterest,
    };
  });
}

export async function fetchYahooZqLive(
  meetingIsos: string[],
): Promise<FedFundsQuote[]> {
  const months = monthsForMeetings(meetingIsos);
  const symbols = months.map(({ year, month }) => yahooZqSymbol(year, month));
  const chunks: string[][] = [];
  for (let index = 0; index < symbols.length; index += 10) {
    chunks.push(symbols.slice(index, index + 10));
  }

  const quotes: FedFundsQuote[] = [];
  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${chunk.map(encodeURIComponent).join(",")}&interval=1m&range=1d`;
      try {
        const raw = await fetchJson(url, { timeoutMs: 8_000 });
        quotes.push(...parseYahooSparkQuotes(raw));
      } catch {
        /* keep other chunks */
      }
    }),
  );
  return quotes;
}

function recentBusinessDay(from = new Date()): Date {
  const date = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

function cmeTradeDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

export async function fetchCmeSettlements(): Promise<FedFundsQuote[]> {
  let trade = recentBusinessDay();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = `${CME_SETTLEMENTS_URL}?tradeDate=${encodeURIComponent(cmeTradeDate(trade))}`;
    const raw = await fetchJson(url, { timeoutMs: 5_000 });
    const rows = z
      .object({
        empty: z.boolean().optional(),
        settlements: z.array(CmeSettlementRowSchema).optional(),
      })
      .parse(raw);
    if (rows.empty || !rows.settlements?.length) {
      trade.setUTCDate(trade.getUTCDate() - 1);
      while (trade.getUTCDay() === 0 || trade.getUTCDay() === 6) {
        trade.setUTCDate(trade.getUTCDate() - 1);
      }
      continue;
    }
    const quotes: FedFundsQuote[] = [];
    for (const row of rows.settlements) {
      if (row.month === "Total") continue;
      const parsedMonth = parseMonthToken(row.month);
      const settle = parseLooseNumber(row.settle);
      if (!parsedMonth || settle == null) continue;
      quotes.push({
        monthKey: row.month,
        year: parsedMonth.year,
        month: parsedMonth.month,
        price: settle,
        volume: parseLooseNumber(row.volume),
        openInterest: parseLooseNumber(row.openInterest),
      });
    }
    if (quotes.length) return quotes;
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value.replace(/%/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function findArray(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  const record = asRecord(root);
  if (!record) return [];
  for (const key of ["content", "data", "forecasts", "items", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const inner = asRecord(value);
    if (inner) {
      for (const nested of ["content", "forecasts", "items", "results"]) {
        if (Array.isArray(inner[nested])) return inner[nested] as unknown[];
      }
    }
  }
  return [];
}

function parseRangeToken(
  token: string,
): { lowerBps: number; upperBps: number } | null {
  const compact = token.replaceAll("%", "").trim();
  const bps = /^(\d{2,4})\s*[-–]\s*(\d{2,4})$/.exec(compact);
  if (bps) {
    return { lowerBps: Number(bps[1]), upperBps: Number(bps[2]) };
  }
  const pct = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.exec(compact);
  if (pct) {
    return {
      lowerBps: Math.round(Number(pct[1]) * 100),
      upperBps: Math.round(Number(pct[2]) * 100),
    };
  }
  return null;
}

function binsFromOfficial(
  item: Record<string, unknown>,
  currentLowerBps: number,
): FedWatchBin[] {
  const bins: FedWatchBin[] = [];
  const mapLike = item.probabilities ?? item.probabilityMap ?? item.rates;
  if (mapLike && typeof mapLike === "object" && !Array.isArray(mapLike)) {
    for (const [label, raw] of Object.entries(mapLike as Record<string, unknown>)) {
      const range = parseRangeToken(label);
      const probability =
        typeof raw === "number"
          ? raw
          : asRecord(raw)
            ? firstNumber(asRecord(raw)!, ["probability", "pct", "value"])
            : Number(raw);
      if (!range || probability == null || !Number.isFinite(probability)) continue;
      const pct = probability <= 1 && probability >= 0 ? probability * 100 : probability;
      bins.push({
        lowerBps: range.lowerBps,
        upperBps: range.upperBps,
        label: rangeLabel(range.lowerBps),
        probability: Math.round(pct * 10) / 10,
        kind: classifyBin(range.lowerBps, currentLowerBps),
      });
    }
  }

  const list =
    (Array.isArray(item.probabilities) && item.probabilities) ||
    (Array.isArray(item.rateProbabilities) && item.rateProbabilities) ||
    (Array.isArray(item.outcomes) && item.outcomes) ||
    [];
  for (const row of list) {
    const rec = asRecord(row);
    if (!rec) continue;
    const label =
      firstString(rec, ["range", "rateRange", "targetRange", "label"]) ?? "";
    const fromPct = firstNumber(rec, ["from", "lower", "low"]);
    const toPct = firstNumber(rec, ["to", "upper", "high"]);
    const range =
      parseRangeToken(label) ??
      (fromPct != null && toPct != null
        ? {
            lowerBps: fromPct > 20 ? Math.round(fromPct) : Math.round(fromPct * 100),
            upperBps: toPct > 20 ? Math.round(toPct) : Math.round(toPct * 100),
          }
        : null);
    const probability = firstNumber(rec, [
      "probability",
      "impliedProbability",
      "pct",
      "value",
    ]);
    if (!range || probability == null) continue;
    const pct = probability <= 1 && probability >= 0 ? probability * 100 : probability;
    bins.push({
      lowerBps: range.lowerBps,
      upperBps: range.upperBps,
      label: rangeLabel(range.lowerBps),
      probability: Math.round(pct * 10) / 10,
      kind: classifyBin(range.lowerBps, currentLowerBps),
    });
  }

  return bins.filter((bin) => bin.probability > 0);
}

export function parseOfficialForecasts(
  raw: unknown,
  currentLowerBps: number,
): FedWatchMeeting[] {
  const meetings: FedWatchMeeting[] = [];
  for (const item of findArray(raw)) {
    const rec = asRecord(item);
    if (!rec) continue;
    const date = firstString(rec, [
      "meetingDt",
      "meetingDate",
      "meeting_date",
      "fomcMeetingDate",
      "date",
    ]);
    if (!date) continue;
    const iso = date.slice(0, 10);
    const bins = binsFromOfficial(rec, currentLowerBps);
    if (!bins.length) continue;
    const summary = bins.reduce(
      (acc, bin) => {
        acc[bin.kind] = Math.round((acc[bin.kind] + bin.probability) * 10) / 10;
        return acc;
      },
      { ease: 0, hold: 0, hike: 0 },
    );
    const price = firstNumber(rec, ["midPrice", "price", "settle", "last"]);
    meetings.push({
      date: iso,
      label: iso,
      tabLabel: iso,
      contract:
        firstString(rec, ["contract", "productCode", "quoteCode"]) ?? "",
      expires: firstString(rec, ["expires", "expirationDt", "expiry"]) ?? iso,
      price,
      impliedRate: price != null ? Math.round((100 - price) * 10000) / 10000 : null,
      volume: firstNumber(rec, ["volume", "priorVolume"]),
      openInterest: firstNumber(rec, ["openInterest", "priorOi", "oi"]),
      bins,
      ...summary,
    });
  }
  return meetings;
}

export function officialApiBase(env: Env): string | null {
  const configured = env.CME_FEDWATCH_API_BASE;
  const base =
    configured ??
    (env.CME_FEDWATCH_ACCESS_TOKEN
      ? "https://markets.api.cmegroup.com/fedwatch_rt/v1"
      : null);
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || !CME_API_HOSTS.has(url.hostname)) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function fetchOfficialFedWatch(
  env: Env,
  currentLowerBps: number,
): Promise<FedWatchMeeting[] | null> {
  const token = env.CME_FEDWATCH_ACCESS_TOKEN;
  const base = officialApiBase(env);
  if (!token || !base) return null;
  const raw = await fetchJson(`${base}/forecasts/latest`, {
    timeoutMs: 10_000,
    headers: { authorization: `Bearer ${token}` },
  });
  const meetings = parseOfficialForecasts(raw, currentLowerBps);
  return meetings.length ? meetings : null;
}
