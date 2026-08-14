"use client";

import { type ComponentProps } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { AttentionStrip } from "@/components/dashboard/AttentionStrip";
import {
  dataTrustKind,
  SessionControlStrip,
} from "@/components/dashboard/SessionControlStrip";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type { AttentionItem } from "@/lib/market-data/overview-attention";
import { formatMarketTime } from "@/lib/utils/format";

function TrustBody({
  items,
  onSelectSymbol,
  ...strip
}: ComponentProps<typeof SessionControlStrip> & {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  return (
    <>
      <SessionControlStrip {...strip} />
      <AttentionStrip items={items} onSelectSymbol={onSelectSymbol} />
    </>
  );
}

export function OverviewStatusChrome({
  items,
  onSelectSymbol,
  ...strip
}: ComponentProps<typeof SessionControlStrip> & {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  const lead = items[0];

  return (
    <>
      <details className="group lg:hidden">
        <summary className="sticky top-12 z-20 flex min-h-11 w-full min-w-0 cursor-pointer list-none items-center gap-2 overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-[var(--ib-text-muted)] transition-transform group-open:rotate-90"
          />
          <span className="sr-only">Toggle session and attention details</span>
          <span className="min-w-0 truncate text-[12px] font-medium capitalize text-[var(--ib-text-primary)] group-open:hidden">
            {strip.session ? `${strip.session} session` : "Session unavailable"}
          </span>
          <StatusIndicator
            kind={dataTrustKind(strip.latencyClass)}
            label={strip.coverageLabel ?? "Unknown coverage"}
            className="max-w-[8.75rem] shrink-0 truncate group-open:hidden"
          />
          {lead ? (
            <span className="min-w-0 truncate font-mono text-[12px] text-[var(--ib-text-primary)] group-open:hidden">
              {lead.print}
            </span>
          ) : null}
          {strip.unhealthyCount ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--state-warning)] group-open:hidden">
              {strip.unhealthyCount} fault{strip.unhealthyCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {strip.licenseWarning ? (
            <ShieldAlert
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[var(--state-warning)] group-open:hidden"
            />
          ) : null}
          <span className="hidden min-w-0 truncate text-[12px] font-medium text-[var(--ib-text-primary)] group-open:inline">
            Session & attention
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--ib-text-muted)]">
            {formatMarketTime(strip.asOf)}
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <TrustBody
            {...strip}
            items={items}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
      </details>
      <div className="hidden space-y-3 bg-[var(--ib-canvas)] pb-1 lg:sticky lg:top-11 lg:z-20 lg:block">
        <TrustBody
          {...strip}
          items={items}
          onSelectSymbol={onSelectSymbol}
        />
      </div>
    </>
  );
}
