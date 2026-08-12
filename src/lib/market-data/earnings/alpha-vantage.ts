import { csvRowsToObjects, parseCsv } from "@/lib/market-data/earnings/csv";
import {
  fiscalPeriodFromEnding,
  mapEarningsSession,
  toNullableNumber,
} from "@/lib/market-data/earnings/parse";
import {
  toAlphaVantageSymbol,
  toCanonicalSymbol,
} from "@/lib/market-data/earnings/symbols";
import type {
  CalendarParseDiagnostics,
  CalendarSourceEvent,
} from "@/lib/market-data/earnings/types";
import { parseIsoDateOnly } from "@/lib/market-data/earnings/window";
import { fetchWithSizeLimit } from "@/lib/providers/rss/ssrf";

/**
 * Official Alpha Vantage endpoint:
 * GET https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=6month&apikey=KEY
 * CSV columns: symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay
 * timeOfTheDay is pre-market | post-market | blank.
 * Horizon options documented by Alpha Vantage: 3month | 6month | 12month.
 */
export const ALPHA_VANTAGE_QUERY_URL = "https://www.alphavantage.co/query";
export const ALPHA_VANTAGE_EARNINGS_HORIZON = "6month";

export type AlphaVantageEarningsParseResult = {
  events: CalendarSourceEvent[];
  diagnostics: CalendarParseDiagnostics;
};

function sanitizeProviderMessage(text: string): string {
  return text.replaceAll(/apikey=[^&\s"]+/gi, "apikey=redacted").slice(0, 240);
}

export function parseAlphaVantageEarningsCsv(
  text: string,
  fetchedAt: string,
): AlphaVantageEarningsParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Alpha Vantage earnings calendar returned an empty body.");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let message = "Alpha Vantage returned JSON instead of CSV.";
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const raw =
        parsed.Note ??
        parsed.Information ??
        parsed["Error Message"] ??
        parsed.error;
      if (typeof raw === "string" && raw.trim()) {
        message = sanitizeProviderMessage(raw.trim());
      }
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  const rows = parseCsv(trimmed);
  const header = (rows[0] ?? []).map((value) => value.trim().toLowerCase());
  if (!header.includes("symbol") || !header.includes("reportdate")) {
    throw new Error("Alpha Vantage CSV is missing symbol/reportDate headers.");
  }

  const objects = csvRowsToObjects(rows);
  const diagnostics: CalendarParseDiagnostics = {
    rawRows: objects.length,
    parsed: 0,
    emptySymbol: 0,
    invalidDate: 0,
    parseFailures: 0,
  };
  const events: CalendarSourceEvent[] = [];

  for (const row of objects) {
    const providerTicker = (row.symbol ?? "").trim().toUpperCase();
    const canonicalSymbol = toCanonicalSymbol(providerTicker);
    if (!canonicalSymbol) {
      diagnostics.emptySymbol += 1;
      continue;
    }
    const reportDate = parseIsoDateOnly(row.reportDate);
    if (!reportDate) {
      diagnostics.invalidDate += 1;
      continue;
    }
    const fiscalEnding = parseIsoDateOnly(row.fiscalDateEnding);
    events.push({
      provider: "alphaVantage",
      providerTicker: toAlphaVantageSymbol(providerTicker),
      canonicalSymbol,
      companyName: (row.name ?? "").trim() || null,
      reportDate,
      session: mapEarningsSession(row.timeOfTheDay),
      fiscalPeriod: fiscalPeriodFromEnding(fiscalEnding),
      epsEstimate: toNullableNumber(row.estimate),
      epsActual: null,
      revenueEstimate: null,
      revenueActual: null,
      fetchedAt,
    });
    diagnostics.parsed += 1;
  }

  return { events, diagnostics };
}

export async function fetchAlphaVantageEarningsCalendar(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  horizon?: string;
}): Promise<AlphaVantageEarningsParseResult> {
  const url = new URL(ALPHA_VANTAGE_QUERY_URL);
  url.searchParams.set("function", "EARNINGS_CALENDAR");
  url.searchParams.set("horizon", options.horizon ?? ALPHA_VANTAGE_EARNINGS_HORIZON);
  url.searchParams.set("apikey", options.apiKey);

  const response = await fetchWithSizeLimit(url.toString(), {
    headers: { accept: "text/csv,text/plain,*/*" },
    signal: AbortSignal.timeout(20_000),
    maxBytes: 5_000_000,
    fetchImpl: options.fetchImpl,
  });
  if (!response.ok) {
    throw new Error(`Alpha Vantage earnings calendar failed: HTTP ${response.status}`);
  }
  return parseAlphaVantageEarningsCsv(await response.text(), new Date().toISOString());
}
