import {
  fiscalPeriodFromEnding,
  fiscalPeriodFromQuarterYear,
  mapEarningsSession,
  surprisePercent,
  toNullableInt,
  toNullableNumber,
} from "@/lib/market-data/earnings/parse";
import type { HistoricalSourceObservation } from "@/lib/market-data/earnings/history-types";
import { parseIsoDateOnly } from "@/lib/market-data/earnings/window";

function avNone(value: unknown): unknown {
  if (typeof value === "string" && value.trim().toUpperCase() === "NONE") return null;
  return value;
}

export function parseFinnhubStockEarnings(raw: unknown): HistoricalSourceObservation[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoricalSourceObservation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const period = parseIsoDateOnly(typeof row.period === "string" ? row.period : null);
    const actual = toNullableNumber(row.actual);
    const estimate = toNullableNumber(row.estimate);
    out.push({
      provider: "finnhub",
      // /stock/earnings `period` is the fiscal ending, not the print date.
      reportDate: null,
      fiscalPeriod:
        fiscalPeriodFromQuarterYear(toNullableInt(row.quarter), toNullableInt(row.year)) ??
        fiscalPeriodFromEnding(period),
      session: "unknown",
      epsEstimate: estimate,
      epsActual: actual,
      epsSurprisePercent:
        toNullableNumber(row.surprisePercent) ?? surprisePercent(actual, estimate),
      revenueEstimate: null,
      revenueActual: null,
      revenueSurprisePercent: null,
    });
  }
  return out;
}

export function parseFinnhubSymbolCalendar(raw: unknown): HistoricalSourceObservation[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(record?.earningsCalendar)
    ? record.earningsCalendar
    : Array.isArray(raw)
      ? raw
      : [];
  const out: HistoricalSourceObservation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const reportDate = parseIsoDateOnly(
      typeof row.date === "string" ? row.date : String(row.date ?? ""),
    );
    if (!reportDate) continue;
    const epsActual = toNullableNumber(row.epsActual);
    const epsEstimate = toNullableNumber(row.epsEstimate);
    const revenueActual = toNullableNumber(row.revenueActual);
    const revenueEstimate = toNullableNumber(row.revenueEstimate);
    out.push({
      provider: "finnhub",
      reportDate,
      fiscalPeriod: fiscalPeriodFromQuarterYear(
        toNullableInt(row.quarter),
        toNullableInt(row.year),
      ),
      session: mapEarningsSession(typeof row.hour === "string" ? row.hour : null),
      epsEstimate,
      epsActual,
      epsSurprisePercent: surprisePercent(epsActual, epsEstimate),
      revenueEstimate,
      revenueActual,
      revenueSurprisePercent: surprisePercent(revenueActual, revenueEstimate),
    });
  }
  return out;
}

export function parseAlphaVantageEarningsHistory(raw: unknown): HistoricalSourceObservation[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  if (record.Note || record.Information || record["Error Message"]) {
    const message = String(record.Note ?? record.Information ?? record["Error Message"]);
    throw new Error(message.slice(0, 240));
  }
  const rows = Array.isArray(record.quarterlyEarnings) ? record.quarterlyEarnings : [];
  const out: HistoricalSourceObservation[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const fiscalEnding = parseIsoDateOnly(String(row.fiscalDateEnding ?? ""));
    const reportDate = parseIsoDateOnly(String(row.reportedDate ?? "")) ?? fiscalEnding;
    const epsActual = toNullableNumber(avNone(row.reportedEPS));
    const epsEstimate = toNullableNumber(avNone(row.estimatedEPS));
    out.push({
      provider: "alphaVantage",
      reportDate,
      fiscalPeriod: fiscalPeriodFromEnding(fiscalEnding),
      session: mapEarningsSession(
        typeof row.reportTime === "string" ? row.reportTime : null,
      ),
      epsEstimate,
      epsActual,
      epsSurprisePercent:
        toNullableNumber(avNone(row.surprisePercentage)) ??
        surprisePercent(epsActual, epsEstimate),
      revenueEstimate: null,
      revenueActual: null,
      revenueSurprisePercent: null,
    });
  }
  return out;
}

export function parseYahooDailyCloses(raw: unknown): { date: string; close: number }[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const chart = record?.chart as { result?: unknown[] } | undefined;
  const first = chart?.result?.[0];
  if (!first || typeof first !== "object") return [];
  const row = first as Record<string, unknown>;
  const stamps = Array.isArray(row.timestamp) ? row.timestamp : [];
  const indicators = row.indicators as { quote?: Array<{ close?: unknown }> } | undefined;
  const closes = indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) return [];
  const out: { date: string; close: number }[] = [];
  for (let index = 0; index < stamps.length; index += 1) {
    const stamp = stamps[index];
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
