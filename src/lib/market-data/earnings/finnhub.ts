import type {
  CalendarParseDiagnostics,
  CalendarSourceEvent,
} from "@/lib/market-data/earnings/types";
import {
  fiscalPeriodFromQuarterYear,
  mapEarningsSession,
  toNullableInt,
  toNullableNumber,
} from "@/lib/market-data/earnings/parse";
import { toCanonicalSymbol, toFinnhubSymbol } from "@/lib/market-data/earnings/symbols";
import {
  parseIsoDateOnly,
  type EarningsCoverageWindow,
} from "@/lib/market-data/earnings/window";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export type FinnhubEarningsParseResult = {
  events: CalendarSourceEvent[];
  diagnostics: CalendarParseDiagnostics;
};

export function parseFinnhubEarningsCalendar(
  raw: unknown,
  fetchedAt: string,
): FinnhubEarningsParseResult {
  const diagnostics: CalendarParseDiagnostics = {
    rawRows: 0,
    parsed: 0,
    emptySymbol: 0,
    invalidDate: 0,
    parseFailures: 0,
  };
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(record?.earningsCalendar)
    ? record.earningsCalendar
    : Array.isArray(raw)
      ? raw
      : null;
  if (!list) {
    diagnostics.parseFailures += 1;
    return { events: [], diagnostics };
  }

  const events: CalendarSourceEvent[] = [];
  diagnostics.rawRows = list.length;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      diagnostics.parseFailures += 1;
      continue;
    }
    const row = item as Record<string, unknown>;
    const providerTicker =
      typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    const canonicalSymbol = toCanonicalSymbol(providerTicker);
    if (!canonicalSymbol) {
      diagnostics.emptySymbol += 1;
      continue;
    }
    const reportDate = parseIsoDateOnly(
      typeof row.date === "string" ? row.date : String(row.date ?? ""),
    );
    if (!reportDate) {
      diagnostics.invalidDate += 1;
      continue;
    }
    events.push({
      provider: "finnhub",
      providerTicker: toFinnhubSymbol(providerTicker),
      canonicalSymbol,
      companyName: typeof row.name === "string" ? row.name.trim() || null : null,
      reportDate,
      session: mapEarningsSession(typeof row.hour === "string" ? row.hour : null),
      fiscalPeriod: fiscalPeriodFromQuarterYear(
        toNullableInt(row.quarter),
        toNullableInt(row.year),
      ),
      epsEstimate: toNullableNumber(row.epsEstimate),
      epsActual: toNullableNumber(row.epsActual),
      revenueEstimate: toNullableNumber(row.revenueEstimate),
      revenueActual: toNullableNumber(row.revenueActual),
      fetchedAt,
    });
    diagnostics.parsed += 1;
  }
  return { events, diagnostics };
}

export async function fetchFinnhubEarningsCalendar(options: {
  apiKey: string;
  window: EarningsCoverageWindow;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): Promise<FinnhubEarningsParseResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? FINNHUB_BASE;
  const url = new URL(`${baseUrl}/calendar/earnings`);
  url.searchParams.set("from", options.window.from);
  url.searchParams.set("to", options.window.to);
  url.searchParams.set("token", options.apiKey);
  const response = await fetchImpl(url.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Finnhub earnings calendar failed: HTTP ${response.status}`);
  }
  return parseFinnhubEarningsCalendar(await response.json(), new Date().toISOString());
}
