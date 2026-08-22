"use client";

import { Badge } from "@/components/ui/Badge";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { EmptyHint } from "@/components/ui/StatePanel";
import { catalystLabel, catalystTone, formatElapsed, haltMark, orderAlertsForTape } from "@/lib/scanner/display";
import type { ScannerAlertEvent } from "@/lib/scanner/types";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";

const TAPE_LIMIT = 48;

export function ScannerTape({
  alerts,
  selected,
  strategyOnly,
  onStrategyOnlyChange,
  onSelect,
  now,
}: {
  alerts: ScannerAlertEvent[];
  selected: string;
  strategyOnly: boolean;
  onStrategyOnlyChange: (value: boolean) => void;
  onSelect: (alert: ScannerAlertEvent) => void;
  now?: number;
}) {
  const shown = orderAlertsForTape(alerts, selected).slice(0, TAPE_LIMIT);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ib-border-subtle)] px-3 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
          {alerts.length.toString().padStart(2, "0")} events
        </p>
        <ChipToggle pressed={strategyOnly} onClick={() => onStrategyOnlyChange(!strategyOnly)}>
          This strategy
        </ChipToggle>
      </div>
      <ol aria-label="Alert tape" className="min-h-0 flex-1 overflow-y-auto terminal-scroll">
        {alerts.length === 0 ? (
          <li>
            <EmptyHint className="!py-4">No alerts this session for the current filters.</EmptyHint>
          </li>
        ) : (
          <>
            {shown.map((alert) => {
            const halt = haltMark(alert.haltStatus);
            return (
              <li key={`${alert.id}-${alert.lastSeenAt}`}>
                <button
                  type="button"
                  onClick={() => onSelect(alert)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-[var(--ib-border-subtle)] px-3 py-2 text-left hover:bg-[var(--ib-surface-hover)]",
                    selected === alert.ticker && "bg-[var(--ib-surface-selected)]",
                    halt && "bg-[color-mix(in_oklab,var(--state-warning)_7%,transparent)]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-[13px] font-semibold">{alert.ticker}</span>
                      <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
                        {formatElapsed(alert.lastSeenAt, now)}
                      </span>
                    </span>
                    <span className={cn("font-mono text-[12px]", marketToneClass(alert.changeFromClosePct))}>
                      {formatSignedPercent(alert.changeFromClosePct)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge tone={alert.status === "consolidated" ? "warn" : "brand"}>
                      {alert.strategyTitle}
                    </Badge>
                    {alert.occurrenceCount > 1 ? (
                      <Badge tone="neutral">×{alert.occurrenceCount}</Badge>
                    ) : null}
                    <Badge tone={catalystTone(alert.catalystKind)}>
                      {catalystLabel(alert.catalystKind, true)}
                    </Badge>
                    {halt ? <Badge tone="warn">{halt === "HALT" ? "Halt" : "Resume"}</Badge> : null}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-4 text-[var(--ib-text-secondary)]">
                    {alert.explanation.headline}
                  </span>
                </button>
              </li>
            );
          })}
            {alerts.length > shown.length ? (
              <li className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                {alerts.length - shown.length} older events not shown
              </li>
            ) : null}
          </>
        )}
      </ol>
    </div>
  );
}
