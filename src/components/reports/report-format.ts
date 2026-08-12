import { editionLabel } from "@/lib/reports/editions";

const REPORT_TIME_ZONE = "America/Chicago";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: REPORT_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const tradingDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatReportTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${timestampFormatter.format(date)} CT`;
}

export function formatTradingDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return tradingDateFormatter.format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
  );
}

export function formatReportStatus(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatEdition(value: string) {
  return editionLabel(value);
}

export function reportSectionId(title: string, index: number) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `section-${index + 1}${slug ? `-${slug}` : ""}`;
}
