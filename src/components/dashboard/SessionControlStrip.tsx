"use client";

import { useState } from "react";
import {
  Activity,
  CalendarClock,
  Clock3,
  Database,
  ShieldAlert,
} from "lucide-react";
import {
  StatusIndicator,
  type StatusKind,
} from "@/components/ui/StatusIndicator";
import { formatMarketDateTime } from "@/lib/utils/format";
import { ProviderHealthBanner, type ProviderHealthRow } from "@/components/dashboard/ProviderHealthBanner";

import { nextEditionLabel } from "@/lib/scheduling/chicago-schedule";

function qualityKind(latencyClass: string | null | undefined): StatusKind {
  if (latencyClass === "mock") return "mock";
  if (latencyClass === "stale") return "stale";
  if (latencyClass === "realtime") return "realtime";
  if (latencyClass?.includes("delayed")) return "delayed";
  if (latencyClass === "unavailable") return "unavailable";
  return "neutral";
}

export function SessionControlStrip({
  session,
  asOf,
  coverageLabel,
  latencyClass,
  providerCount,
  unhealthyCount,
  licenseWarning,
  providers,
}: {
  session?: string | null;
  asOf: string;
  coverageLabel?: string | null;
  latencyClass?: string | null;
  providerCount: number;
  unhealthyCount: number;
  licenseWarning?: string | null;
  providers?: ProviderHealthRow[];
}) {
  const [healthOpen, setHealthOpen] = useState(false);
  return (
    <section
      aria-label="Market session and data trust"
      className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
    >
      <div className="grid divide-y divide-[var(--ib-border-subtle)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-[1fr_1.45fr_1fr_1fr]">
        <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--state-info)]">
            <Clock3 aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Market session
            </p>
            <p className="mt-0.5 truncate text-[12px] font-medium capitalize text-[var(--ib-text-primary)]">
              {session ? `${session} session` : "Session unavailable"}
            </p>
          </div>
        </div>

        <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
            <Database aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Data trust
              </p>
              <StatusIndicator
                kind={qualityKind(latencyClass)}
                label={coverageLabel ?? "Unknown coverage"}
              />
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--ib-text-secondary)]">
              {formatMarketDateTime(asOf, { seconds: true })}
            </p>
          </div>
        </div>

        <div className="relative flex min-h-12 items-center gap-2.5 px-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
            <Activity aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Provider health
            </p>
            <button
              type="button"
              aria-expanded={healthOpen}
              onClick={() => setHealthOpen((open) => !open)}
              className="mt-0.5 text-left text-[12px] text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
            >
              {unhealthyCount
                ? `${unhealthyCount} of ${providerCount} need attention`
                : `${providerCount} configured · no active fault`}
            </button>
          </div>
          {healthOpen && providers ? (
            <div className="absolute left-0 top-full z-40 mt-1 w-[min(100vw-1.5rem,22rem)] shadow-[var(--shadow-float)]">
              <ProviderHealthBanner
                providers={providers}
                latencyCoverageLabel={coverageLabel}
                asOf={asOf}
                marketSession={session}
                licenseWarning={licenseWarning}
              />
            </div>
          ) : null}
        </div>

        <div className="flex min-h-12 items-center gap-2.5 px-3 py-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--ib-maroon-300)]">
            <CalendarClock aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Next scheduled brief
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-[var(--ib-text-primary)]">
              {nextEditionLabel(new Date(asOf))}
            </p>
          </div>
        </div>
      </div>
      {licenseWarning ? (
        <div className="flex items-start gap-2 border-t border-[color-mix(in_oklab,var(--state-warning)_28%,var(--ib-border-subtle))] bg-[color-mix(in_oklab,var(--state-warning)_6%,transparent)] px-3 py-2 text-[11px] leading-4 text-[var(--state-warning)]">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          <span>{licenseWarning}</span>
        </div>
      ) : null}
    </section>
  );
}
