"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  ChevronDown,
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
import { cn } from "@/lib/utils/cn";

export function dataTrustKind(latencyClass: string | null | undefined): StatusKind {
  if (latencyClass === "mock") return "mock";
  if (latencyClass === "stale") return "stale";
  if (latencyClass === "realtime") return "realtime";
  if (latencyClass?.includes("delayed")) return "delayed";
  if (latencyClass === "unavailable") return "unavailable";
  if (latencyClass === "eod") return "neutral";
  return "neutral";
}

export function trustCompactLabel(latencyClass: string | null | undefined): string {
  if (latencyClass === "mock") return "Mock";
  if (latencyClass === "stale") return "Stale";
  if (latencyClass === "realtime") return "Live";
  if (latencyClass?.includes("delayed")) return "Delayed";
  if (latencyClass === "unavailable") return "Off";
  if (latencyClass === "eod") return "EOD";
  return "Data";
}

export function sessionCompactLabel(session?: string | null): string {
  if (!session) return "Session";
  return session.charAt(0).toUpperCase() + session.slice(1);
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
  universeCoverage,
}: {
  session?: string | null;
  asOf: string;
  coverageLabel?: string | null;
  latencyClass?: string | null;
  providerCount: number;
  unhealthyCount: number;
  licenseWarning?: string | null;
  providers?: ProviderHealthRow[];
  universeCoverage?: string | null;
}) {
  const [healthOpen, setHealthOpen] = useState(false);
  const healthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!healthOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setHealthOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!healthRef.current?.contains(event.target as Node)) {
        setHealthOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [healthOpen]);

  return (
    <section
      aria-label="Market session and data trust"
      className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
    >
      <div className="grid divide-y divide-[var(--ib-border-subtle)] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-[1fr_1.45fr_1fr_1fr]">
        <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">
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

        <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]">
            <Database aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Data trust
              </p>
              <StatusIndicator
                kind={dataTrustKind(latencyClass)}
                label={coverageLabel ?? "Unknown coverage"}
              />
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--ib-text-secondary)]">
              {session === "closed" ? "Last print " : ""}
              {formatMarketDateTime(asOf, { seconds: true })}
              {universeCoverage ? ` · ${universeCoverage}` : ""}
            </p>
          </div>
        </div>

        <div
          ref={healthRef}
          className={cn(
            "relative flex min-h-11 items-center gap-2.5 px-3 py-1.5",
            unhealthyCount
              ? "bg-[color-mix(in_oklab,var(--state-warning)_6%,transparent)]"
              : null,
          )}
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-[4px] bg-[var(--ib-surface-2)]",
              unhealthyCount
                ? "text-[var(--state-warning)]"
                : "text-[var(--ib-text-secondary)]",
            )}
          >
            <Activity aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Provider health
            </p>
            <button
              type="button"
              aria-expanded={healthOpen}
              aria-haspopup="dialog"
              onClick={() => setHealthOpen((open) => !open)}
              className="mt-0.5 inline-flex min-h-8 max-sm:min-h-11 items-center gap-1 text-left text-[12px] text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
            >
              <span
                className={cn(
                  unhealthyCount ? "text-[var(--state-warning)]" : null,
                )}
              >
                {unhealthyCount
                  ? `${unhealthyCount} of ${providerCount} need attention`
                  : `${providerCount} configured · no active fault`}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3 text-[var(--ib-text-muted)] transition-transform",
                  healthOpen && "rotate-180",
                )}
              />
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

        <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">
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
