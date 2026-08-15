"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PercentText } from "@/components/watchlists/display";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatVolume,
} from "@/lib/utils/format";
import {
  ROLE_LABELS,
  SECURITY_TYPE_LABELS,
  isLeveragedProduct,
} from "@/lib/watchlists/taxonomy";
import { WhyMovingBadge } from "@/components/news/WhyMovingBadge";
import type { MoveExplanation } from "@/lib/intelligence/types";
import type {
  CoverageCatalyst,
  CoverageQuote,
  CoverageSector,
  CoverageWatchlist,
} from "@/lib/watchlists/types";

export function TickerInspector({
  row,
  catalysts,
  explanation,
  lists,
  sectors,
  canEdit,
  onClose,
  onRemove,
  onMove,
}: {
  row: CoverageQuote;
  catalysts: CoverageCatalyst[];
  explanation?: MoveExplanation;
  lists: CoverageWatchlist[];
  sectors: CoverageSector[];
  canEdit: boolean;
  onClose: () => void;
  onRemove?: () => void;
  onMove?: (target: { type: "watchlist" | "sector"; id: string; mode: "copy" | "move" }) => void;
}) {
  const related = catalysts.filter((item) => item.ticker === row.ticker);
  const destinations = [
    ...lists
      .filter((list) => !list.archivedAt)
      .map((list) => ({
        value: `watchlist:${list.id}`,
        label: `List · ${list.name}`,
      })),
    ...sectors
      .filter((sector) => !sector.archivedAt)
      .map((sector) => ({
        value: `sector:${sector.id}`,
        label: `${sector.kind} · ${sector.name}`,
      })),
  ];
  return (
    <div className="border-t border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-[var(--ib-text-primary)]">
              {row.ticker}
            </h3>
            {row.sectorName ? <Badge tone="info">{row.sectorName}</Badge> : null}
            <Badge tone="neutral">{SECURITY_TYPE_LABELS[row.securityType]}</Badge>
            {row.role ? <Badge tone="info">{ROLE_LABELS[row.role]}</Badge> : null}
            {isLeveragedProduct(row) ? <Badge tone="warn">Daily reset</Badge> : null}
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--ib-text-secondary)]">
            {row.name ?? "Name unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && onRemove ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-6">
        <Item label="Last" value={formatPrice(row.last, row.ticker)} />
        <Item label="1D" value={<PercentText value={row.change1dPercent} />} />
        <Item label="1W" value={<PercentText value={row.change1wPercent} />} />
        <Item label="1M" value={<PercentText value={row.change1mPercent} />} />
        <Item label="YTD" value={<PercentText value={row.changeYtdPercent} />} />
        <Item label="vs SPY" value={<PercentText value={row.vsSpy1dPercent} />} />
        <Item label="vs bmk" value={<PercentText value={row.vsBenchmark1dPercent} />} />
        <Item label="vs group" value={<PercentText value={row.vsGroup1dPercent} />} />
        <Item label="RVOL" value={formatRelativeVolume(row.relativeVolume)} />
        <Item label="Volume" value={formatVolume(row.volume)} />
        <Item label="Mkt cap" value={formatCompactCurrency(row.marketCap)} />
        <Item label="Vol (ann.)" value={row.volatility == null ? "—" : `${row.volatility.toFixed(1)}%`} />
        <Item label="Pre / AH" value={
          <span className="flex gap-2">
            <PercentText value={row.preMarketChangePercent} />
            <PercentText value={row.afterHoursChangePercent} />
          </span>
        } />
      </dl>

      {row.rationale ? (
        <p className="mt-3 text-[12px] text-[var(--ib-text-secondary)]">{row.rationale}</p>
      ) : null}
      {row.notes ? (
        <p className="mt-3 text-[12px] text-[var(--ib-text-secondary)]">{row.notes}</p>
      ) : null}
      {isLeveragedProduct(row) ? (
        <p className="mt-2 text-[11px] text-[var(--ib-text-muted)]">
          Leveraged/inverse products reset daily
          {row.underlyingSymbol ? ` versus ${row.underlyingSymbol}` : ""}. Do not treat them as ordinary constituents.
        </p>
      ) : null}
      {row.themeCount > 1 ? (
        <p className="mt-2 text-[11px] text-[var(--ib-text-muted)]">
          Also appears in {row.themeCount} themes/industries.
        </p>
      ) : null}
      {row.tags.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <Badge key={tag} tone="neutral">{tag}</Badge>
          ))}
        </div>
      ) : null}

      {canEdit && onMove ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-[var(--ib-text-muted)]" htmlFor={`move-${row.ticker}`}>
            Place in
          </label>
          <select
            id={`move-${row.ticker}`}
            className="field-control h-8 w-auto min-w-40 text-xs"
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const [type, id] = value.split(":") as ["watchlist" | "sector", string];
              onMove({ type, id, mode: "copy" });
              event.target.value = "";
            }}
          >
            <option value="">Copy to…</option>
            {destinations.map((destination) => (
              <option key={`copy-${destination.value}`} value={destination.value}>
                {destination.label}
              </option>
            ))}
          </select>
          <select
            className="field-control h-8 w-auto min-w-40 text-xs"
            defaultValue=""
            aria-label={`Move ${row.ticker}`}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const [type, id] = value.split(":") as ["watchlist" | "sector", string];
              onMove({ type, id, mode: "move" });
              event.target.value = "";
            }}
          >
            <option value="">Move to…</option>
            {destinations.map((destination) => (
              <option key={`move-${destination.value}`} value={destination.value}>
                {destination.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {explanation ? (
        <div className="mt-3 space-y-1.5 border-t border-[var(--ib-border-subtle)] pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Why it’s moving
          </p>
          <WhyMovingBadge
            explanation={explanation}
            href={`/news?q=${encodeURIComponent(`why is ${row.ticker} moving today`)}`}
          />
          <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
            {explanation.detail}
          </p>
          <p className="text-[11px] text-[var(--ib-text-muted)]">
            {explanation.evidenceNature === "fact"
              ? "Fact from a primary source."
              : "System inference from timing, ticker match, and available reporting — not a confirmed cause."}
            {explanation.coverageGap ? ` ${explanation.coverageGap}` : ""}
          </p>
        </div>
      ) : null}

      {related.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--ib-border-subtle)] pt-3">
          {related.map((item) => (
            <li key={item.id} className="text-[12px] text-[var(--ib-text-secondary)]">
              <Badge tone={item.kind === "earnings" ? "warn" : "info"}>{item.kind}</Badge>{" "}
              {item.url ? (
                <a href={item.url} className="hover:text-[var(--ib-text-primary)]" target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
              {item.at ? (
                <span className="ml-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                  {item.at.slice(0, 10)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--ib-text-muted)]">
          No attached earnings or headlines for this name in the current research window.
        </p>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[12px] text-[var(--ib-text-primary)]">{value}</dd>
    </div>
  );
}
