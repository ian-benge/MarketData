import { z } from "zod";

/**
 * Canonical report editions. Three scheduled deliveries per U.S. trading day.
 * Do not add a separate close or postmarket edition.
 */
export const REPORT_EDITIONS = [
  "premarket",
  "midday",
  "close_postmarket",
] as const;

export const ReportEditionSchema = z.enum(REPORT_EDITIONS);
export type ReportEdition = z.infer<typeof ReportEditionSchema>;

/** Bump when scheduled local times or edition set change. */
export const SCHEDULE_VERSION = "v3-close-postmarket";

export const EDITION_LABELS: Record<ReportEdition, string> = {
  premarket: "Premarket",
  midday: "Midday",
  close_postmarket: "Close / Postmarket",
};

export const EDITION_PDF_SLUGS: Record<ReportEdition, string> = {
  premarket: "Premarket",
  midday: "Midday",
  close_postmarket: "Close_Postmarket",
};

export const EDITION_CONTENT_NOTES: Record<ReportEdition, string> = {
  premarket:
    "Premarket edition — overnight futures, premarket movers, and today's calendar. Prices reflect the latest available delayed/premarket prints in the evidence bundle.",
  midday:
    "Midday edition — session-to-date tape, intraday material movers, and catalysts since the open. Opens with an audit of the premarket theses.",
  close_postmarket:
    "Close / Postmarket edition — complete regular-session recap plus developments from the first hour after the official U.S. close. Published at 4:00 p.m. America/Chicago on normal sessions (or one hour after an official early close). Not a separate mid-afternoon close report.",
};

export const DEFAULT_FIRM_UUID = "a0000000-0000-4000-8000-000000000001";

export function isReportEdition(value: string): value is ReportEdition {
  return (REPORT_EDITIONS as readonly string[]).includes(value);
}

export function editionLabel(edition: string): string {
  if (isReportEdition(edition)) return EDITION_LABELS[edition];
  if (edition === "close") return EDITION_LABELS.close_postmarket;
  return edition.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function editionPdfSlug(edition: string): string {
  if (isReportEdition(edition)) return EDITION_PDF_SLUGS[edition];
  if (edition === "close") return EDITION_PDF_SLUGS.close_postmarket;
  return edition.replace(/[^\w]+/g, "_");
}

export function normalizeReportEdition(value: string | undefined): ReportEdition | undefined {
  if (!value) return undefined;
  if (value === "close") return "close_postmarket";
  return isReportEdition(value) ? value : undefined;
}

export function priorEditionsFor(edition: ReportEdition): ReportEdition[] {
  if (edition === "midday") return ["premarket"];
  if (edition === "close_postmarket") return ["premarket", "midday"];
  return [];
}

export function buildIdempotencyKey(
  tradingDate: string,
  edition: ReportEdition,
  firmId: string,
  scheduleVersion: string = SCHEDULE_VERSION,
): string {
  return `${tradingDate}:${edition}:${scheduleVersion}:${firmId}`;
}
