"use client";

import { useMemo, useState } from "react";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import type {
  EarningsHistorySnapshot,
  HistoricalQuarter,
} from "@/lib/market-data/earnings/history-types";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatSignedPercent,
} from "@/lib/utils/format";

const SESSION: Record<string, string> = {
  bmo: "BMO",
  amc: "AMC",
  during: "RTH",
  unknown: "TBD",
};

function formatEps(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function toneClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "text-[var(--ib-text-primary)]";
  }
  return value > 0 ? "text-[var(--market-positive)]" : "text-[var(--market-negative)]";
}

function barFill(actual: number | null, estimate: number | null, kind: "actual" | "estimate") {
  if (kind === "estimate") return "var(--ib-text-muted)";
  if (actual == null || estimate == null) return "var(--ib-maroon-500)";
  if (actual > estimate) return "var(--market-positive)";
  if (actual < estimate) return "var(--market-negative)";
  return "var(--ib-maroon-400)";
}

export function EarningsHistoryPanel({
  ticker,
  companyName,
  data,
  loading,
}: {
  ticker: string;
  companyName: string | null;
  data: EarningsHistorySnapshot | null;
  loading: boolean;
}) {
  const quarters = data?.quarters;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    quarters?.find((row) => row.id === selectedId) ?? quarters?.[0] ?? null;

  const chart = useMemo(() => {
    const rows = [...(quarters ?? [])].reverse();
    const epsValues = rows.flatMap((row) =>
      [row.epsActual, row.epsEstimate].filter(
        (value): value is number => value != null && Number.isFinite(value),
      ),
    );
    const maxEps = Math.max(0.01, ...epsValues.map((value) => Math.abs(value)));
    const reactions = rows
      .map((row) => row.reactionNextPercent)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const maxReaction = Math.max(8, ...reactions.map((value) => Math.abs(value)));
    const growth = rows
      .map((row) => row.revenueGrowthPercent)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const maxGrowth = Math.max(12, ...growth.map((value) => Math.abs(value)));
    const growthPoints = rows
      .map((row, index) => {
        if (row.revenueGrowthPercent == null || !Number.isFinite(row.revenueGrowthPercent)) {
          return null;
        }
        const x = ((index + 0.5) / Math.max(1, rows.length)) * 100;
        const y = 42 - (row.revenueGrowthPercent / maxGrowth) * 28;
        return `${x},${y}`;
      })
      .filter((point): point is string => point != null);
    return { rows, maxEps, maxReaction, growthPoints };
  }, [quarters]);

  if (loading && !data) {
    return (
      <div className="mt-3 rounded-[4px] border border-[var(--ib-border-subtle)] px-3 py-6 text-center text-[12px] text-[var(--ib-text-muted)]">
        Loading {ticker} history…
      </div>
    );
  }

  if (!data) return null;
  const quarterRows = data.quarters;

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--ib-border-subtle)] pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Historical print · last {quarterRows.length} quarters
          </p>
          <h4 className="text-[12px] font-semibold text-[var(--ib-text-primary)]">
            {companyName ?? ticker} earnings history
          </h4>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusIndicator
            kind={
              data.sources.finnhub.stale
                ? "stale"
                : data.sources.finnhub.ok
                  ? "healthy"
                  : data.sources.finnhub.configured
                    ? "failed"
                    : "disabled"
            }
            label={`FH ${data.sources.finnhub.rowCount}`}
          />
          <StatusIndicator
            kind={
              data.sources.alphaVantage.stale
                ? "stale"
                : data.sources.alphaVantage.ok
                  ? "healthy"
                  : data.sources.alphaVantage.configured
                    ? "failed"
                    : "disabled"
            }
            label={`AV ${data.sources.alphaVantage.rowCount}`}
          />
          <StatusIndicator
            kind={
              data.sources.yahoo.stale
                ? "stale"
                : data.sources.yahoo.ok
                  ? "healthy"
                  : "failed"
            }
            label={`YH ${data.sources.yahoo.rowCount}`}
          />
          {data.stale ? <StatusIndicator kind="stale" label="Stale" /> : null}
        </div>
      </div>

      {data.error && !quarterRows.length ? (
        <p className="rounded-[4px] border border-dashed border-[var(--ib-border-subtle)] px-3 py-4 text-center text-[12px] text-[var(--ib-text-muted)]">
          {data.error}
        </p>
      ) : null}

      {chart.rows.length ? (
        <div className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              EPS actual vs estimate · revenue growth · reaction
            </p>
            <div className="flex flex-wrap gap-3 font-mono text-[9px] uppercase text-[var(--ib-text-muted)]">
              <span>Est.</span>
              <span className="text-[var(--ib-maroon-300)]">Act.</span>
              <span className="text-[var(--ib-text-secondary)]">Rev g</span>
              <span>Rxn</span>
            </div>
          </div>
          <div className="relative h-[180px]">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--ib-border-subtle)]" />
            {chart.growthPoints.length > 1 ? (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  points={chart.growthPoints.join(" ")}
                  fill="none"
                  stroke="var(--ib-text-secondary)"
                  strokeWidth="1.1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
            <div className="absolute inset-0 flex items-end justify-between gap-1 px-1">
              {chart.rows.map((row) => {
                const active = selected?.id === row.id;
                const estH =
                  row.epsEstimate != null
                    ? Math.max(6, (Math.abs(row.epsEstimate) / chart.maxEps) * 70)
                    : 0;
                const actH =
                  row.epsActual != null
                    ? Math.max(6, (Math.abs(row.epsActual) / chart.maxEps) * 70)
                    : 0;
                const rxn =
                  row.reactionNextPercent != null
                    ? (row.reactionNextPercent / chart.maxReaction) * 40
                    : 0;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    title={tooltip(row)}
                    aria-label={tooltip(row).replaceAll("\n", ", ")}
                    aria-pressed={active}
                    className={cn(
                      "flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-[2px] px-0.5",
                      active && "bg-[var(--ib-surface-selected)]",
                    )}
                  >
                    <span className="flex h-[72%] w-full items-end justify-center gap-0.5">
                      <span
                        className="w-[38%] max-w-3 rounded-t-[1px]"
                        style={{
                          height: `${estH}%`,
                          background: barFill(row.epsActual, row.epsEstimate, "estimate"),
                          opacity: 0.55,
                        }}
                      />
                      <span
                        className="w-[38%] max-w-3 rounded-t-[1px]"
                        style={{
                          height: `${actH}%`,
                          background: barFill(row.epsActual, row.epsEstimate, "actual"),
                        }}
                      />
                    </span>
                    <span
                      className="w-[70%] max-w-4 rounded-[1px]"
                      style={{
                        height: `${Math.max(2, Math.abs(rxn))}%`,
                        background:
                          row.reactionNextPercent == null
                            ? "var(--ib-border-subtle)"
                            : row.reactionNextPercent >= 0
                              ? "var(--market-positive)"
                              : "var(--market-negative)",
                      }}
                    />
                    <span className="truncate font-mono text-[8px] text-[var(--ib-text-muted)]">
                      {(row.fiscalPeriod ?? "—").replace(/20(\d{2})$/, "'$1")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {selected ? (
        <dl className="grid grid-cols-2 gap-2 font-mono text-[10px] sm:grid-cols-4">
          <div>
            <dt className="text-[var(--ib-text-muted)]">Quarter / date</dt>
            <dd className="mt-0.5 text-[var(--ib-text-primary)]">
              {selected.fiscalPeriod ?? "—"} · {selected.reportDate ?? "—"} ·{" "}
              {SESSION[selected.session]}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--ib-text-muted)]">EPS est / act / surp</dt>
            <dd className={cn("mt-0.5", toneClass(selected.epsSurprisePercent))}>
              {formatEps(selected.epsEstimate)} / {formatEps(selected.epsActual)} /{" "}
              {formatSignedPercent(selected.epsSurprisePercent, 1)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--ib-text-muted)]">Rev est / act / surp</dt>
            <dd className={cn("mt-0.5", toneClass(selected.revenueSurprisePercent))}>
              {formatCompactCurrency(selected.revenueEstimate)} /{" "}
              {formatCompactCurrency(selected.revenueActual)} /{" "}
              {formatSignedPercent(selected.revenueSurprisePercent, 1)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--ib-text-muted)]">Rev growth / rxn 1d / 5d</dt>
            <dd className="mt-0.5 text-[var(--ib-text-primary)]">
              {formatSignedPercent(selected.revenueGrowthPercent, 1)} ·{" "}
              <span className={toneClass(selected.reactionNextPercent)}>
                {formatSignedPercent(selected.reactionNextPercent, 1)}
              </span>{" "}
              /{" "}
              <span className={toneClass(selected.reactionFiveDayPercent)}>
                {formatSignedPercent(selected.reactionFiveDayPercent, 1)}
              </span>
            </dd>
          </div>
        </dl>
      ) : null}
      {selected?.missing.length ? (
        <p className="font-mono text-[10px] text-[var(--ib-text-muted)]">
          Missing: {selected.missing.join(", ")}
        </p>
      ) : null}

      {quarterRows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left font-mono text-[10px]">
            <thead>
              <tr className="text-[var(--ib-text-muted)]">
                <th className="pb-1 font-medium">Qtr</th>
                <th className="pb-1 font-medium">Date</th>
                <th className="pb-1 font-medium">Sess</th>
                <th className="pb-1 font-medium">EPS e/a</th>
                <th className="pb-1 font-medium">EPS surp</th>
                <th className="pb-1 font-medium">Rev e/a</th>
                <th className="pb-1 font-medium">Rev surp</th>
                <th className="pb-1 font-medium">Rev g</th>
                <th className="pb-1 font-medium">1d</th>
                <th className="pb-1 font-medium">5d</th>
                <th className="pb-1 font-medium">Src</th>
              </tr>
            </thead>
            <tbody>
              {quarterRows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "cursor-pointer border-t border-[var(--ib-border-subtle)]",
                    selected?.id === row.id && "bg-[var(--ib-surface-selected)]",
                  )}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-1 text-[var(--ib-text-primary)]">{row.fiscalPeriod ?? "—"}</td>
                  <td className="py-1">{row.reportDate ?? "—"}</td>
                  <td className="py-1">{SESSION[row.session]}</td>
                  <td className="py-1">
                    {formatEps(row.epsEstimate)}/{formatEps(row.epsActual)}
                  </td>
                  <td className={cn("py-1", toneClass(row.epsSurprisePercent))}>
                    {formatSignedPercent(row.epsSurprisePercent, 1)}
                  </td>
                  <td className="py-1">
                    {formatCompactCurrency(row.revenueEstimate)}/
                    {formatCompactCurrency(row.revenueActual)}
                  </td>
                  <td className={cn("py-1", toneClass(row.revenueSurprisePercent))}>
                    {formatSignedPercent(row.revenueSurprisePercent, 1)}
                  </td>
                  <td className={cn("py-1", toneClass(row.revenueGrowthPercent))}>
                    {formatSignedPercent(row.revenueGrowthPercent, 1)}
                  </td>
                  <td className={cn("py-1", toneClass(row.reactionNextPercent))}>
                    {formatSignedPercent(row.reactionNextPercent, 1)}
                  </td>
                  <td className={cn("py-1", toneClass(row.reactionFiveDayPercent))}>
                    {formatSignedPercent(row.reactionFiveDayPercent, 1)}
                  </td>
                  <td className="py-1 uppercase text-[var(--ib-text-muted)]">
                    {row.sources.map((source) => (source === "finnhub" ? "FH" : "AV")).join("+")}
                    {row.reactionNextPercent != null || row.reactionFiveDayPercent != null
                      ? "+YH"
                      : ""}
                    {row.missing.length ? " · gap" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[10px] leading-4 text-[var(--ib-text-muted)]">
        History from Finnhub `/stock/earnings` + `/calendar/earnings` and Alpha Vantage `EARNINGS`.
        Price reaction is delayed Yahoo daily close-to-close. Missing fields stay —. Not OPRA.
        {data.usingFixtures ? " DEMO fixture history." : ""}
        {data.error ? ` ${data.error}` : ""}
      </p>
    </div>
  );
}

function tooltip(row: HistoricalQuarter) {
  return [
    row.fiscalPeriod ?? "Unknown quarter",
    `Date ${row.reportDate ?? "—"} ${SESSION[row.session]}`,
    `EPS ${formatEps(row.epsEstimate)} / ${formatEps(row.epsActual)} (${formatSignedPercent(row.epsSurprisePercent, 1)})`,
    `Rev ${formatCompactCurrency(row.revenueEstimate)} / ${formatCompactCurrency(row.revenueActual)} (${formatSignedPercent(row.revenueSurprisePercent, 1)})`,
    `Rxn 1d ${formatSignedPercent(row.reactionNextPercent, 1)} · 5d ${formatSignedPercent(row.reactionFiveDayPercent, 1)}`,
    row.missing.length ? `Missing: ${row.missing.join(", ")}` : "Complete print",
  ].join("\n");
}
