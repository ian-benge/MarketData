"use client";

import { CalendarClock, ChevronRight } from "lucide-react";
import type { MarketPulseResult } from "@/lib/market-data/market-pulse";
import { selectUpcomingUsdHighImpactRisks } from "@/lib/market-data/next-risk";
import type { NormalizedCalendarEvent } from "@/lib/providers/types";
import { formatMarketDateTime } from "@/lib/utils/format";

function countdown(target: string, base: string) {
  const milliseconds = Date.parse(target) - Date.parse(base);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
}

export function RiskWatch({
  events,
  asOf,
  result,
}: {
  events: NormalizedCalendarEvent[];
  asOf: string;
  result: MarketPulseResult;
}) {
  const risks = selectUpcomingUsdHighImpactRisks(events, asOf);
  const ratesDriver = result.drivers.find((driver) => driver.id === "rates");
  const ratesSensitive = Math.abs(ratesDriver?.contribution ?? 0) >= 2.5;

  return (
    <footer className="flex flex-col gap-3 border-t border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:px-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[5px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] text-[var(--ib-text-muted)]">
          <CalendarClock className="size-4" />
        </span>
        {risks.length > 0 ? (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              <span>Next risk</span>
              <span>•</span>
              <span>USD high-impact</span>
              <span>•</span>
              <span>
                {risks.length} event{risks.length === 1 ? "" : "s"}
              </span>
              {ratesSensitive ? (
                <span className="rounded-[3px] border border-[color-mix(in_oklab,var(--state-warning)_35%,var(--ib-border-subtle))] px-1.5 py-0.5 text-[var(--state-warning)]">
                  Rates-sensitive session
                </span>
              ) : null}
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {risks.map((event) => (
                <li key={event.id} className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ib-text-muted)]">
                    <time dateTime={event.scheduledAt}>
                      {formatMarketDateTime(event.scheduledAt)}
                    </time>
                    <span>•</span>
                    <span>{countdown(event.scheduledAt, asOf)}</span>
                    <span className="rounded-[3px] border border-[var(--ib-border-strong)] px-1.5 py-0.5">
                      high-impact
                    </span>
                    <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5">
                      {(event.country ?? "USD").toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--ib-text-secondary)]">
                    {event.title} · {event.category.replaceAll("_", " ")} ·{" "}
                    {event.providerName}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Next risk · USD high-impact
            </p>
            <p className="mt-1 text-[11px] text-[var(--ib-text-secondary)]">
              No high-impact USD event scheduled in the catalyst window.
            </p>
          </div>
        )}
      </div>
      <a
        href="#catalyst-calendar"
        className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
      >
        Full catalyst calendar <ChevronRight className="size-3" />
      </a>
    </footer>
  );
}
