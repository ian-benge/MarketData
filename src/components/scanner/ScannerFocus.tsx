"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  catalystLabel,
  catalystTone,
  formatFloatShares,
  haltMark,
  isMuted,
  newsFreshnessLabel,
  usefulHaltReason,
  wideSpread,
} from "@/lib/scanner/display";
import type {
  RankedScannerRow,
  ScannerFeatureSnapshot,
  ScannerUserState,
} from "@/lib/scanner/types";
import { cn } from "@/lib/utils/cn";
import {
  formatCompactCurrency,
  formatPrice,
  formatRelativeVolume,
  formatSignedPercent,
  formatVolume,
  marketToneClass,
} from "@/lib/utils/format";

const MarketChart = dynamic(
  () => import("@/components/dashboard/MarketChart").then((mod) => mod.MarketChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  },
);

export function ScannerFocus({
  ticker,
  feature,
  row,
  pins,
  mutes,
  watchlists,
  activeStrategy,
  mocked,
  session,
  onPin,
  onMute,
  onLoadWatchlists,
  onAdd,
  onSelectTicker,
}: {
  ticker: string;
  feature: ScannerFeatureSnapshot | null;
  row: RankedScannerRow | null;
  pins: string[];
  mutes: ScannerUserState["mutes"];
  watchlists: Array<{ id: string; name: string }>;
  activeStrategy: string | null;
  mocked: boolean;
  session: string | null;
  onPin: () => void;
  onMute: () => void;
  onLoadWatchlists: () => void;
  onAdd: (id: string) => void;
  onSelectTicker: (ticker: string) => void;
}) {
  const [chartOpen, setChartOpen] = useState(false);
  const explanation = feature?.explanation;
  const pinned = pins.includes(ticker);
  const muted = isMuted(mutes, ticker, activeStrategy);
  const last = feature?.last ?? row?.last;
  const change = feature?.changeFromClosePct ?? row?.changeFromClosePct;
  const rvol = feature?.relativeVolume ?? row?.relativeVolume;
  const name = feature?.name ?? row?.name;
  const whyHref = `/news?q=${encodeURIComponent(`why is ${ticker} moving today`)}`;
  const halt = haltMark(feature?.haltStatus ?? row?.haltStatus);
  const haltReason = usefulHaltReason(feature?.haltReason ?? row?.haltReason, ticker);
  const spread = row?.spreadFraction ?? feature?.spreadFraction;
  const related = (explanation?.relatedTickers ?? []).filter(
    (symbol) => symbol.toUpperCase() !== ticker.toUpperCase(),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--ib-border-subtle)] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--ib-text-primary)]">
            {ticker} · event detail
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-[var(--ib-text-muted)]">
            {name ?? "Name unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant={pinned ? "secondary" : "ghost"} onClick={onPin}>
            {pinned ? "Pinned" : "Pin"}
          </Button>
          <Button size="sm" variant={muted ? "secondary" : "ghost"} onClick={onMute}>
            {muted ? "Muted" : "Mute"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 terminal-scroll">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[22px] font-medium tracking-[-0.03em] text-[var(--ib-text-primary)]">
            {formatPrice(last, ticker)}
          </p>
          <p className={cn("font-mono text-[16px]", marketToneClass(change))}>
            {formatSignedPercent(change)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={catalystTone(feature?.catalystKind ?? row?.catalystKind ?? "unexplained")}>
            {catalystLabel(feature?.catalystKind ?? row?.catalystKind ?? "unexplained")}
          </Badge>
          <Badge tone="neutral">{formatRelativeVolume(rvol)} RVOL</Badge>
          {(feature?.newsFreshness ?? row?.newsFreshness) &&
          (feature?.newsFreshness ?? row?.newsFreshness) !== "none" ? (
            <Badge tone="info">
              {newsFreshnessLabel(feature?.newsFreshness ?? row!.newsFreshness)}
            </Badge>
          ) : (
            <Badge tone="neutral">No qualifying headline</Badge>
          )}
          {halt ? (
            <Badge tone="warn" title={haltReason ?? undefined}>
              {halt === "HALT" ? "Halted" : "Resumed"}
            </Badge>
          ) : null}
          {wideSpread(spread) ? (
            <Badge tone="warn">Spread {((spread ?? 0) * 100).toFixed(1)}%</Badge>
          ) : null}
          {feature?.formerRunner ? <Badge tone="warn">Former runner</Badge> : null}
          {feature?.offeringRisk ? <Badge tone="warn">Offering risk</Badge> : null}
          {feature?.inPosition || row?.inPosition ? <Badge tone="brand">Book</Badge> : null}
          {feature?.inWatchlist || row?.inWatchlist ? <Badge tone="info">Watchlist</Badge> : null}
        </div>

        <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
          Float {formatFloatShares(row?.floatShares ?? feature?.floatShares)}
          {" · "}
          $Vol {formatCompactCurrency(row?.dollarVolume ?? feature?.dollarVolume)}
          {" · "}
          Spread{" "}
          {(row?.spreadFraction ?? feature?.spreadFraction) != null
            ? `${((row?.spreadFraction ?? feature?.spreadFraction)! * 100).toFixed(2)}%`
            : "—"}
          {" · "}
          VWAP {formatPrice(row?.vwap ?? feature?.vwap)}
        </p>

        {explanation ? (
          <div className="space-y-2 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
            {haltReason ? (
              <p className="font-mono text-[11px] text-[var(--state-warning)]">{haltReason}</p>
            ) : null}
            <p className="text-[13px] text-[var(--ib-text-primary)]">{explanation.headline}</p>
            <p>{explanation.detail}</p>
            <p>
              <span className="font-medium text-[var(--ib-text-primary)]">Why now. </span>
              {explanation.whyNow}
            </p>
            <p>
              <span className="font-medium text-[var(--ib-text-primary)]">Confirmation. </span>
              {explanation.confirmation}
            </p>
            <p>
              <span className="font-medium text-[var(--ib-text-primary)]">Invalidation. </span>
              {explanation.invalidation}
            </p>
            {explanation.unresolved ? (
              <p className="text-[var(--state-warning)]">
                Unresolved — competing explanations listed, no invented catalyst.
              </p>
            ) : null}
            {explanation.competing.length ? (
              <ul className="list-disc pl-4">
                {explanation.competing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {related.length ? (
              <p className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                Related{" "}
                {related.map((symbol, index) => (
                  <span key={symbol}>
                    {index ? ", " : null}
                    <button
                      type="button"
                      className="text-[var(--ib-maroon-300)] hover:underline"
                      onClick={() => onSelectTicker(symbol)}
                    >
                      {symbol}
                    </button>
                  </span>
                ))}
              </p>
            ) : null}
            {explanation.evidence.length ? (
              <ul className="space-y-1">
                {explanation.evidence.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      className="text-[var(--ib-maroon-300)] hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.title}
                    </a>
                    <span className="ml-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                      <ClientMarketTime value={item.publishedAt} />
                      {item.publisher ? ` · ${item.publisher}` : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--ib-text-muted)]">
            No explanation payload for this name in the current snapshot.
          </p>
        )}

        {row ? (
          <div className="grid grid-cols-2 gap-3">
            <ScoreList title="Opportunity" score={row.opportunity} tone="opportunity" />
            <ScoreList title="Risk" score={row.risk} tone="risk" />
          </div>
        ) : null}

        <details className="rounded-[4px] border border-[var(--ib-border-subtle)]">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]">
            Position facts
          </summary>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--ib-border-subtle)] px-3 py-2 font-mono text-[11px] text-[var(--ib-text-secondary)]">
          <dt>Float</dt>
          <dd>{formatFloatShares(row?.floatShares ?? feature?.floatShares)}</dd>
          <dt>Float rotation</dt>
          <dd>
            {row?.floatRotation != null
              ? `${row.floatRotation.toFixed(2)}×`
              : feature?.floatRotation != null
                ? `${feature.floatRotation.toFixed(2)}×`
                : "—"}
          </dd>
          <dt>Dollar volume</dt>
          <dd>{formatCompactCurrency(row?.dollarVolume ?? feature?.dollarVolume)}</dd>
          <dt>Volume</dt>
          <dd>{formatVolume(row?.volume ?? feature?.volume)}</dd>
          <dt>VWAP</dt>
          <dd>{formatPrice(row?.vwap ?? feature?.vwap)}</dd>
          <dt>ATR</dt>
          <dd>{formatPrice(row?.atr ?? feature?.atr)}</dd>
          <dt>Spread</dt>
          <dd>
            {(row?.spreadFraction ?? feature?.spreadFraction) != null
              ? `${((row?.spreadFraction ?? feature?.spreadFraction)! * 100).toFixed(2)}%`
              : "—"}
          </dd>
          <dt>Short interest</dt>
          <dd>
            {(row?.shortInterestPct ?? feature?.shortInterestPct) != null
              ? `${(row?.shortInterestPct ?? feature?.shortInterestPct)!.toFixed(1)}%`
              : "—"}
          </dd>
          <dt>52-week high</dt>
          <dd>{formatPrice(row?.week52High ?? feature?.week52High)}</dd>
          <dt>Halt</dt>
          <dd title={haltReason ?? undefined}>
            {halt ?? row?.haltStatus ?? feature?.haltStatus ?? "unknown"}
            {haltReason ? ` · ${haltReason}` : ""}
          </dd>
        </dl>
        </details>

        {feature?.themes.length || feature?.watchlistNames.length ? (
          <div className="flex flex-wrap gap-1">
            {feature.watchlistNames.map((list) => (
              <Badge key={list} tone="info">
                {list}
              </Badge>
            ))}
            {feature.themes.map((theme) => (
              <Link key={theme} href={`/news?theme=${encodeURIComponent(theme)}`}>
                <Badge tone="neutral">{theme}</Badge>
              </Link>
            ))}
          </div>
        ) : null}

        {feature?.dataQuality ? (
          <p className="font-mono text-[11px] leading-4 text-[var(--ib-text-muted)]">
            {!feature.dataQuality.float
              ? "Float unavailable — float-gated scanners fail closed. "
              : null}
            {!feature.dataQuality.news ? "No qualifying headline in the news window. " : null}
            {!feature.dataQuality.bars
              ? "Intraday bars unavailable — velocity and HOD acceleration are incomplete. "
              : null}
            {!feature.dataQuality.options
              ? "Unusual options flow is not entitled on this feed. "
              : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <Link href={whyHref} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Material News
          </Link>
          <Link
            href={`/dashboard?symbol=${encodeURIComponent(ticker)}`}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            Chart
          </Link>
          <Link
            href={`/watchlists?ticker=${encodeURIComponent(ticker)}`}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            Coverage
          </Link>
          {row?.inPosition || feature?.inPosition ? (
            <Link href="/positions" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              Positions
            </Link>
          ) : null}
        </div>

        <details className="rounded-[4px] border border-[var(--ib-border-subtle)]">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]">
            Add to watchlist
          </summary>
          <div className="space-y-2 border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="ghost" onClick={onLoadWatchlists}>
              {watchlists.length ? "Refresh lists" : "Load lists"}
            </Button>
          </div>
          {watchlists.length ? (
            <div className="flex flex-wrap gap-1.5">
              {watchlists.map((list) => (
                <Button key={list.id} size="sm" onClick={() => onAdd(list.id)}>
                  {list.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--ib-text-muted)]">
              Load shared lists to drop this name into coverage.
            </p>
          )}
          </div>
        </details>

        <details
          className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)]"
          open={chartOpen}
          onToggle={(event) => setChartOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]">
            Intraday chart
          </summary>
          {chartOpen ? (
            <div className="border-t border-[var(--ib-border-subtle)] p-2">
              <MarketChart
                initialSeries={{}}
                initialSymbol={ticker}
                symbol={ticker}
                coverageLabel={feature?.coverageNotes ?? null}
                asOf={feature?.asOf ?? row?.asOf ?? new Date().toISOString()}
                mode={mocked ? "mock" : "provider"}
                marketSession={session}
              />
            </div>
          ) : null}
        </details>
      </div>
    </div>
  );
}

function ScoreList({
  title,
  score,
  tone,
}: {
  title: string;
  score: RankedScannerRow["opportunity"];
  tone: "opportunity" | "risk";
}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {title}{" "}
        <span
          className={
            tone === "opportunity" ? "text-[var(--market-positive)]" : "text-[var(--state-warning)]"
          }
        >
          {score.total.toFixed(0)}
        </span>
      </p>
      <ul className="space-y-1">
        {score.factors.slice(0, 4).map((factor) => (
          <li key={factor.id} className="flex items-start justify-between gap-2 text-[11px]">
            <span className="text-[var(--ib-text-secondary)]">
              {factor.label}
              <span className="ml-1 text-[var(--ib-text-muted)]">{factor.note}</span>
            </span>
            <span className="shrink-0 font-mono">{factor.contribution.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
