import { addCalendarDays } from "@/lib/market-data/earnings/window";
import type { EarningsCalendarEvent } from "@/lib/market-data/earnings/types";

const HIGH_IMPLIED_MOVE = 4;
const MEGA_CAP = 50_000_000_000;

export function rankOverviewEarningsRisk(input: {
  events: EarningsCalendarEvent[];
  today: string;
  coverageTickers?: readonly string[];
  inBookTickers?: readonly string[];
  limit?: number;
}): EarningsCalendarEvent[] {
  const coverage = new Set(
    (input.coverageTickers ?? []).map((ticker) => ticker.toUpperCase()),
  );
  const inBook = new Set(
    (input.inBookTickers ?? []).map((ticker) => ticker.toUpperCase()),
  );
  const horizon = new Set([
    input.today,
    addCalendarDays(input.today, 1),
    addCalendarDays(input.today, 2),
  ]);
  const scored = input.events
    .filter((event) => {
      if (horizon.has(event.reportDate)) return true;
      const implied = event.impliedMove?.percent ?? 0;
      return implied >= HIGH_IMPLIED_MOVE && event.reportDate >= input.today;
    })
    .map((event) => {
      const ticker = event.ticker.toUpperCase();
      const implied = event.impliedMove?.percent ?? 0;
      let score = implied;
      if (inBook.has(ticker)) score += 100;
      if (coverage.has(ticker)) score += 40;
      if ((event.marketCap ?? 0) >= MEGA_CAP) score += 8;
      if (event.reportDate === input.today) score += 6;
      else if (event.reportDate === addCalendarDays(input.today, 1)) score += 3;
      return { event, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.event.reportDate.localeCompare(b.event.reportDate) ||
        a.event.ticker.localeCompare(b.event.ticker);
    });
  const seen = new Set<string>();
  const out: EarningsCalendarEvent[] = [];
  for (const row of scored) {
    const key = row.event.ticker.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.event);
    if (out.length >= (input.limit ?? 8)) break;
  }
  return out;
}
