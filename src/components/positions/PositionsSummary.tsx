"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { PortfolioPnlChart } from "@/components/positions/PortfolioPnlChart";
import {
  SignedValue,
  SideLabel,
  toneClass,
} from "@/components/positions/display";
import { cn } from "@/lib/utils/cn";
import {
  formatCurrency,
  formatSignedPercent,
  formatQuantity,
} from "@/lib/utils/format";
import type { PositionsSnapshot } from "@/lib/positions/types";

function Metric({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-b border-[var(--ib-border-subtle)] px-3 py-2 sm:border-b-0 sm:border-r sm:py-2.5 last:border-r-0",
        className,
      )}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        {label}
      </p>
      <div className="mt-1 font-mono text-[16px] leading-5 tabular-nums text-[var(--ib-text-primary)] sm:text-[18px] sm:leading-6">
        {children}
      </div>
      {hint ? (
        <p className="mt-0.5 hidden text-[11px] text-[var(--ib-text-muted)] sm:block">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ExposureBar({
  long,
  short,
}: {
  long: number | null;
  short: number | null;
}) {
  const longValue = long ?? 0;
  const shortValue = short ?? 0;
  const total = longValue + shortValue;
  if (total <= 0) {
    return (
      <p className="text-[12px] text-[var(--ib-text-muted)]">
        Exposure unavailable until marks arrive.
      </p>
    );
  }
  const longPct = (longValue / total) * 100;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-[2px] bg-[var(--ib-surface-inset)]">
        <span
          className="bg-[var(--market-positive)]"
          style={{ width: `${longPct}%` }}
        />
        <span
          className="bg-[var(--market-negative)]"
          style={{ width: `${100 - longPct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px]">
        <span className="text-[var(--market-positive)]">
          Long {formatCurrency(long, { compact: true })}
        </span>
        <span className="text-[var(--market-negative)]">
          Short {formatCurrency(short, { compact: true })}
        </span>
      </div>
    </div>
  );
}

export function PositionsMetricsStrip({
  snapshot,
  onAccountValueChange,
  savingAccountValue = false,
}: {
  snapshot: PositionsSnapshot;
  onAccountValueChange?: (value: number | null) => void;
  savingAccountValue?: boolean;
}) {
  const summary = snapshot.summary;
  const hasAccountValue = snapshot.accountValue != null;
  const [draft, setDraft] = useState(
    snapshot.accountValue != null ? String(snapshot.accountValue) : "",
  );
  const [editingAccount, setEditingAccount] = useState(!hasAccountValue);

  useEffect(() => {
    setDraft(snapshot.accountValue != null ? String(snapshot.accountValue) : "");
    setEditingAccount(snapshot.accountValue == null);
  }, [snapshot.accountValue, snapshot.ownerId]);

  function commitAccountValue() {
    if (!onAccountValueChange || !snapshot.canEdit) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      onAccountValueChange(null);
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(snapshot.accountValue != null ? String(snapshot.accountValue) : "");
      return;
    }
    if (snapshot.accountValue != null && Math.abs(next - snapshot.accountValue) < 0.005) {
      setEditingAccount(false);
      return;
    }
    onAccountValueChange(next);
  }

  return (
    <Panel
      title="Book snapshot"
      description="Portfolio value, exposure, P&L, and buying power. Enter total account value (including cash) to size weights, cash, and margin."
      actions={
        snapshot.usingFixtures ? undefined : snapshot.stale ? (
          <Badge tone="warn">Stale</Badge>
        ) : (
          <Badge tone="info">{snapshot.latencyCoverageLabel}</Badge>
        )
      }
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-9">
        <Metric
          label="Portfolio"
          hint={
            summary.accountValue != null
              ? "Account value incl. cash"
              : "Set account value to include cash"
          }
        >
          {formatCurrency(summary.portfolioValue, { compact: true })}
        </Metric>
        <Metric label="Invested" hint="Long market value">
          {formatCurrency(summary.investedValue, { compact: true })}
        </Metric>
        <Metric
          label="Cash"
          hint={
            summary.cash == null
              ? "Derived from account value"
              : summary.cash < 0
                ? "Account below invested longs"
                : "Account − invested"
          }
        >
          {formatCurrency(summary.cash, { compact: true })}
        </Metric>
        <Metric label="Gross" hint={`${summary.openCount} open`}>
          {formatCurrency(summary.grossExposure, { compact: true })}
        </Metric>
        <Metric
          label="Net"
          hint={
            summary.netExposurePercent == null
              ? undefined
              : `${formatSignedPercent(summary.netExposurePercent)} of gross`
          }
        >
          {formatCurrency(summary.netExposure, { compact: true })}
        </Metric>
        <Metric
          label="Day P&L"
          hint={
            summary.dayPercent == null
              ? "Open lots vs prior close"
              : summary.accountValue != null
                ? `${formatSignedPercent(summary.dayPercent)} of account`
                : `${formatSignedPercent(summary.dayPercent)} of gross`
          }
        >
          <SignedValue value={summary.dayPnl} compact />
        </Metric>
        <Metric label="Total P&L" hint="Unrealized + realized">
          <SignedValue value={summary.totalPnl} compact />
        </Metric>
        <Metric label="Unrealized" hint="Open lots vs entry" className="hidden sm:block">
          <SignedValue value={summary.unrealizedPnl} compact />
        </Metric>
        <Metric
          label="Realized"
          hint={`${summary.closedCount} closed`}
          className="hidden sm:block"
        >
          <SignedValue value={summary.realizedPnl} compact />
        </Metric>
      </div>

      <div className="grid grid-cols-1 border-t border-[var(--ib-border-subtle)] sm:grid-cols-3">
        <Metric
          label="Intraday BP"
          hint={
            summary.intradayBuyingPower == null
              ? "4× account · set account value"
              : "4× account value"
          }
        >
          {formatCurrency(summary.intradayBuyingPower, { compact: true })}
        </Metric>
        <Metric
          label="Overnight BP"
          hint={
            summary.overnightBuyingPower == null
              ? "2× account · set account value"
              : "2× account value"
          }
        >
          {formatCurrency(summary.overnightBuyingPower, { compact: true })}
        </Metric>
        <Metric
          label="Option BP"
          hint={
            summary.optionBuyingPower == null
              ? "1× cash · set account value"
              : "1× cash"
          }
          className="sm:last:border-r-0"
        >
          {formatCurrency(summary.optionBuyingPower, { compact: true })}
        </Metric>
      </div>

      {hasAccountValue && !editingAccount ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ib-border-subtle)] px-3 py-2">
          <p className="text-[12px] text-[var(--ib-text-secondary)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
              Account value
            </span>
            <span className="ml-2 font-mono tabular-nums text-[var(--ib-text-primary)]">
              {formatCurrency(snapshot.accountValue)}
            </span>
            <span className="ml-2 text-[11px] text-[var(--ib-text-muted)]">
              Cash = account − long market value
            </span>
          </p>
          {snapshot.canEdit && onAccountValueChange ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingAccount(true)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--ib-border-subtle)] px-3 py-2.5">
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="account-value"
              className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]"
            >
              Account value (incl. cash)
            </label>
            <input
              id="account-value"
              className="field-control font-mono"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="e.g. 250000"
              value={draft}
              disabled={!snapshot.canEdit || !onAccountValueChange || savingAccountValue}
              autoFocus={editingAccount && hasAccountValue}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitAccountValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitAccountValue();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape" && hasAccountValue) {
                  setDraft(String(snapshot.accountValue));
                  setEditingAccount(false);
                }
              }}
            />
          </div>
          {snapshot.canEdit && onAccountValueChange ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={savingAccountValue}
              onClick={commitAccountValue}
            >
              {savingAccountValue ? "Saving…" : "Save"}
            </Button>
          ) : null}
          {hasAccountValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingAccountValue}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft(String(snapshot.accountValue));
                setEditingAccount(false);
              }}
            >
              Cancel
            </Button>
          ) : null}
          <p className="pb-2 text-[11px] text-[var(--ib-text-muted)]">
            {snapshot.canEdit
              ? savingAccountValue
                ? "Saving…"
                : "Cash = account − long market value. Position weights use account value when set."
              : "View only — account value is set by the book owner."}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function PastPositionsMetrics({
  snapshot,
}: {
  snapshot: PositionsSnapshot;
}) {
  const summary = snapshot.summary;
  return (
    <div className="grid grid-cols-2 border-b border-[var(--ib-border-subtle)] sm:grid-cols-5">
      <Metric label="Realized P&L" hint="Closed lots vs entry">
        <SignedValue value={summary.realizedPnl} compact />
      </Metric>
      <Metric
        label="Realized return"
        hint={
          summary.closedCostBasis == null
            ? "Closed cost unavailable"
            : `Cost ${formatCurrency(summary.closedCostBasis, { compact: true })}`
        }
      >
        <SignedValue value={summary.realizedReturnPercent} kind="percent" />
      </Metric>
      <Metric label="Closed lots" hint="Fully exited sleeves">
        {summary.closedCount}
      </Metric>
      <Metric label="Hit rate" hint="Winning closed lots">
        {summary.closedHitRate == null
          ? "—"
          : `${summary.closedHitRate.toFixed(0)}%`}
      </Metric>
      <Metric label="Avg hold" hint="Calendar days to exit">
        {summary.closedAverageHoldingDays == null
          ? "—"
          : `${Math.round(summary.closedAverageHoldingDays)}d`}
      </Metric>
    </div>
  );
}

export function PositionsAttribution({
  snapshot,
}: {
  snapshot: PositionsSnapshot;
}) {
  const summary = snapshot.summary;
  return (
    <Panel
      title="Exposure & attribution"
      description="Long/short mix, top contributors, and the book P&L path. Widen the window with 1M–Max."
      bodyClassName="p-0"
    >
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-[var(--ib-border-subtle)] p-3 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Long / short exposure
          </p>
          <div className="mt-3">
            <ExposureBar
              long={summary.longExposure}
              short={summary.shortExposure}
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <dt className="text-[var(--ib-text-muted)]">Long names</dt>
              <dd className="font-mono">{summary.longCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Short names</dt>
              <dd className="font-mono">{summary.shortCount}</dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">L/S ratio</dt>
              <dd className="font-mono">
                {summary.longShortRatio == null
                  ? "—"
                  : `${summary.longShortRatio.toFixed(2)}x`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Quoted</dt>
              <dd className="font-mono">
                {summary.quotedCount}/{summary.openCount}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">1W P&L</dt>
              <dd>
                <SignedValue value={summary.change1wPnl} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">1M P&L</dt>
              <dd>
                <SignedValue value={summary.change1mPnl} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Hit rate</dt>
              <dd className="font-mono">
                {summary.hitRate == null ? "—" : `${summary.hitRate.toFixed(0)}%`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg hold</dt>
              <dd className="font-mono">
                {summary.averageHoldingDays == null
                  ? "—"
                  : `${formatQuantity(summary.averageHoldingDays)}d`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg winner</dt>
              <dd>
                <SignedValue value={summary.averageWinner} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Avg loser</dt>
              <dd>
                <SignedValue value={summary.averageLoser} compact />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Book return</dt>
              <dd>
                <SignedValue value={summary.bookReturnPercent} kind="percent" />
              </dd>
            </div>
            <div>
              <dt className="text-[var(--ib-text-muted)]">Top weight</dt>
              <dd className="font-mono">
                {summary.largestWeight == null
                  ? "—"
                  : `${summary.largestWeight.toFixed(1)}%`}
              </dd>
            </div>
          </dl>
        </div>

        <div className="p-3">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Contributors
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-[var(--ib-text-muted)]">Winners</p>
              <ul className="mt-1 space-y-1">
                {summary.winners.length ? (
                  summary.winners.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 font-mono text-[12px]"
                    >
                      <span className="flex items-center gap-1.5">
                        {row.ticker}
                        <SideLabel side={row.side} />
                      </span>
                      <SignedValue value={row.pnl} compact />
                    </li>
                  ))
                ) : (
                  <li className="text-[12px] text-[var(--ib-text-muted)]">None</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-[11px] text-[var(--ib-text-muted)]">Losers</p>
              <ul className="mt-1 space-y-1">
                {summary.losers.length ? (
                  summary.losers.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 font-mono text-[12px]"
                    >
                      <span className="flex items-center gap-1.5">
                        {row.ticker}
                        <SideLabel side={row.side} />
                      </span>
                      <SignedValue value={row.pnl} compact />
                    </li>
                  ))
                ) : (
                  <li className="text-[12px] text-[var(--ib-text-muted)]">None</li>
                )}
              </ul>
            </div>
          </div>
          {summary.byStrategy.length ? (
            <ul className="mt-3 space-y-1 border-t border-[var(--ib-border-subtle)] pt-2">
              {summary.byStrategy.slice(0, 4).map((slice) => (
                <li
                  key={slice.key}
                  className="flex items-center justify-between font-mono text-[11px] text-[var(--ib-text-secondary)]"
                >
                  <span>{slice.label}</span>
                  <span>
                    {formatCurrency(slice.value, { compact: true })}
                    <span className={cn("ml-2", toneClass(slice.weight))}>
                      {slice.weight == null ? "" : `${slice.weight.toFixed(1)}%`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[var(--ib-border-subtle)] p-3">
        <PortfolioPnlChart
          series={snapshot.series}
          positions={snapshot.positions}
          asOf={snapshot.asOf}
        />
      </div>
    </Panel>
  );
}
