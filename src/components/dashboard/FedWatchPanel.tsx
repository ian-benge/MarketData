"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyHint } from "@/components/ui/StatePanel";
import { FEDWATCH_REFRESH_MS } from "@/lib/market-data/fedwatch/types";
import type {
  FedWatchLookbackId,
  FedWatchMeeting,
  FedWatchSnapshot,
} from "@/lib/market-data/fedwatch/types";
import { formatFedFundsRange } from "@/lib/market-data/fedwatch/calc";
import { formatMarketDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const BAR_BLUE = "var(--state-info)";
const GRID = [100, 80, 60, 40, 20, 0] as const;

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatPpDelta(now: number | null | undefined, prior: number | null | undefined) {
  if (now == null || prior == null || !Number.isFinite(now) || !Number.isFinite(prior)) {
    return "—";
  }
  const delta = now - prior;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toFixed(1)}pp`;
}

function formatIsoDate(iso: string, year: "2" | "4" = "4") {
  const [y, month, day] = iso.split("-").map(Number);
  if (!y || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: year === "2" ? "2-digit" : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, month - 1, day)));
}

function formatCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function lookbackHeader(id: FedWatchLookbackId, date: string | null) {
  if (id === "now") return "Now*";
  const label = id === "1d" ? "1 Day" : id === "1w" ? "1 Week" : "1 Month";
  return date ? `${label} (${formatIsoDate(date)})` : label;
}

function InfoTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)]">
          {rows.map(([label]) => (
            <th
              key={label}
              className="px-2 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.07em] text-[var(--ib-text-muted)]"
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {rows.map(([label, value]) => (
            <td
              key={label}
              className="px-2 py-2 font-mono text-[12px] tabular-nums text-[var(--ib-text-primary)]"
            >
              {value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function ProbabilityChart({
  meeting,
  targetLabel,
}: {
  meeting: FedWatchMeeting;
  targetLabel: string | null;
}) {
  const fromTable = meeting.compareRows?.map((row) => ({
    lowerBps: row.lowerBps,
    label: row.label,
    probability: row.values.now ?? 0,
  }));
  const bins = [...(fromTable ?? meeting.bins)]
    .filter((bin) => bin.probability > 0)
    .sort((a, b) => a.lowerBps - b.lowerBps);
  return (
    <div className="overflow-x-auto rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--ib-text-primary)]">
            Target Rate Probabilities for {meeting.label} Fed Meeting
          </h3>
          {targetLabel ? (
            <p className="mt-0.5 text-[11px] text-[var(--ib-text-muted)]">
              Current target rate is {targetLabel}.
            </p>
          ) : null}
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          Probability
        </p>
      </div>
      <div className="relative h-[220px] pl-8">
        {GRID.map((tick) => (
          <div
            key={tick}
            className="absolute right-0 left-8 flex items-center"
            style={{ bottom: `${tick}%`, transform: "translateY(50%)" }}
          >
            <span className="absolute -left-8 font-mono text-[9px] tabular-nums text-[var(--ib-text-muted)]">
              {tick}%
            </span>
            <span className="h-px w-full bg-[var(--ib-border-subtle)]" />
          </div>
        ))}
        <div className="absolute inset-y-0 left-8 right-0 flex min-w-[12rem] items-end justify-center gap-4 px-2 sm:gap-10 sm:px-6">
          {bins.map((bin) => (
            <div key={bin.label} className="relative flex h-full w-12 shrink-0 items-end justify-center sm:w-16">
              <div
                className="relative w-10 rounded-t-[2px]"
                style={{
                  height: `${Math.max(bin.probability, 0.6)}%`,
                  background: BAR_BLUE,
                }}
                title={`${bin.label} bps · ${formatPct(bin.probability)}`}
              >
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[11px] font-semibold tabular-nums text-[var(--ib-text-primary)]">
                  {formatPct(bin.probability)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex min-w-[12rem] justify-center gap-4 pl-8 sm:gap-10">
        {bins.map((bin) => (
          <span
            key={`label-${bin.label}`}
            className="w-12 shrink-0 text-center font-mono text-[10px] tabular-nums text-[var(--ib-text-secondary)] sm:w-16"
          >
            {bin.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        Target Rate (in bps)
      </p>
    </div>
  );
}

function HistoryTable({ meeting }: { meeting: FedWatchMeeting }) {
  const lookbacks = meeting.lookbacks ?? [];
  const rows = meeting.compareRows ?? [];
  if (!lookbacks.length || !rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-[4px] border border-[var(--ib-border-subtle)]">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)]">
            <th className="px-2 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.07em] text-[var(--ib-text-muted)]">
              Target Rate (bps)
            </th>
            {lookbacks.map((lookback) => (
              <th
                key={lookback.id}
                className={cn(
                  "px-2 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em]",
                  lookback.id === "now"
                    ? "bg-[color-mix(in_oklab,var(--state-warning)_16%,var(--ib-surface-inset))] text-[var(--ib-text-primary)]"
                    : "text-[var(--ib-text-muted)]",
                )}
              >
                {lookbackHeader(lookback.id, lookback.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--ib-border-subtle)]">
              <th className="px-2 py-1.5 font-mono text-[11px] font-medium text-[var(--ib-text-primary)]">
                {formatFedFundsRange(row.label)}
                {row.current ? (
                  <span className="ml-1 text-[9px] uppercase tracking-[0.06em] text-[var(--ib-text-muted)]">
                    (Current)
                  </span>
                ) : null}
              </th>
              {lookbacks.map((lookback) => (
                <td
                  key={`${row.label}-${lookback.id}`}
                  className={cn(
                    "px-2 py-1.5 font-mono text-[11px] tabular-nums",
                    lookback.id === "now"
                      ? "bg-[color-mix(in_oklab,var(--state-warning)_12%,transparent)] text-[var(--ib-text-primary)]"
                      : "text-[var(--ib-text-secondary)]",
                  )}
                >
                  {formatPct(row.values[lookback.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FedWatchPanel() {
  const [data, setData] = useState<FedWatchSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/market/fedwatch", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as FedWatchSnapshot;
        if (cancelled) return;
        setData(next);
        setSelected((current) => {
          if (current && next.meetings.some((meeting) => meeting.date === current)) {
            return current;
          }
          return next.meetings[0]?.date ?? null;
        });
      } catch {
        /* keep last valid snapshot */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void pull();
    const interval = window.setInterval(pull, expanded ? FEDWATCH_REFRESH_MS : 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [expanded]);

  const meeting =
    data?.meetings.find((item) => item.date === selected) ?? data?.meetings[0] ?? null;
  const lookback1d = meeting?.lookbacks?.find((item) => item.id === "1d");
  const pollSeconds = expanded ? (data?.refreshSeconds ?? 15) : 60;

  return (
    <Panel
      title="CME FedWatch"
      description={
        expanded
          ? `FOMC rate-hike projections · America/Chicago · updates every ${pollSeconds}s`
          : `Next meeting · ease / hold / hike · 1d Δ · ${pollSeconds}s`
      }
      bodyClassName="space-y-3 p-3"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <Badge
              tone={
                data.source === "unavailable" || data.stale
                  ? "warn"
                  : data.delayed
                    ? "info"
                    : "brand"
              }
            >
              {data.stale ? `${data.sourceLabel} · stale` : data.sourceLabel}
            </Badge>
          ) : null}
          <ChipToggle
            pressed={expanded}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="normal-case tracking-[0.08em]"
          >
            {expanded ? "Collapse" : "Expand"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", expanded ? "rotate-180" : null)}
            />
          </ChipToggle>
        </div>
      }
    >
      {loading && !data ? (
        <div className="space-y-3" aria-label="Loading Fed funds futures">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {data && !data.meetings.length ? (
        <EmptyHint>{data.error ?? "Rate-hike projections are unavailable."}</EmptyHint>
      ) : null}

      {data && meeting && !expanded ? (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-[var(--ib-text-primary)]">
            {meeting.label}
          </p>
          <dl className="grid grid-cols-3 gap-2 font-mono text-[11px]">
            {(
              [
                ["Ease", meeting.ease, lookback1d?.ease],
                ["Hold", meeting.hold, lookback1d?.hold],
                ["Hike", meeting.hike, lookback1d?.hike],
              ] as const
            ).map(([label, now, prior]) => (
              <div
                key={label}
                className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-2 py-1.5"
              >
                <dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[var(--ib-text-primary)]">
                  {formatPct(now)}
                  <span className="ml-1 text-[10px] text-[var(--ib-text-muted)]">
                    {formatPpDelta(now, prior)} 1d
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <ProbabilityChart
            meeting={meeting}
            targetLabel={formatFedFundsRange(data.currentTarget?.label)}
          />
        </div>
      ) : null}

      {data && meeting && expanded ? (
        <>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {data.meetings.map((item) => {
              const active = item.date === meeting.date;
              return (
                <button
                  key={item.date}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(item.date)}
                  className={cn(
                    "shrink-0 rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.04em] transition-colors",
                    active
                      ? "border-[var(--ib-maroon-500)] bg-[var(--ib-surface-selected)] text-[var(--ib-text-primary)]"
                      : "border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)] hover:border-[var(--ib-border-control)]",
                  )}
                >
                  {item.tabLabel}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 overflow-x-auto lg:grid-cols-2">
            <div className="overflow-x-auto rounded-[4px] border border-[var(--ib-border-subtle)]">
              <InfoTable
                title="Meeting information"
                rows={[
                  ["Meeting Date", formatIsoDate(meeting.date)],
                  ["Contract", meeting.contract],
                  ["Expires", formatIsoDate(meeting.expires)],
                  ["Mid Price", meeting.price != null ? meeting.price.toFixed(4) : "—"],
                  ["Prior Volume", formatCount(meeting.volume)],
                  ["Prior OI", formatCount(meeting.openInterest)],
                ]}
              />
            </div>
            <div className="overflow-x-auto rounded-[4px] border border-[var(--ib-border-subtle)]">
              <InfoTable
                title="Probabilities"
                rows={[
                  ["Ease", formatPct(meeting.ease)],
                  ["No Change", formatPct(meeting.hold)],
                  ["Hike", formatPct(meeting.hike)],
                ]}
              />
            </div>
          </div>

          <ProbabilityChart
            meeting={meeting}
            targetLabel={formatFedFundsRange(data.currentTarget?.label)}
          />

          <HistoryTable meeting={meeting} />

          <div className="space-y-1 text-[10px] leading-4 text-[var(--ib-text-muted)]">
            <p>
              * Data as of {formatMarketDateTime(data.quoteAsOf ?? data.asOf, { seconds: true })}
              {data.effr ? ` · EFFR ${data.effr.value.toFixed(2)}% as of ${data.effr.asOf}` : ""}
              {meeting.impliedRate != null
                ? ` · implied rate ${(meeting.impliedRate).toFixed(3)}%`
                : ""}
            </p>
            <p>1/1/2028 and forward are projected meeting dates.</p>
            <p>
              {data.attribution}{" "}
              <a
                href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html"
                className="text-[var(--ib-maroon-300)] underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                CME FedWatch Tool
              </a>
              {data.error ? ` · ${data.error}` : null}
            </p>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
