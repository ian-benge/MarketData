"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, X } from "lucide-react";
import type { MarketPulseResult } from "@/lib/market-data/market-pulse";
import { cn } from "@/lib/utils/cn";

export function MarketPulseMethodology({
  result,
  onClose,
  className,
}: {
  result: MarketPulseResult;
  onClose?: () => void;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }, [offset.x, offset.y]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const pad = 8;
    let adjustX = 0;
    let adjustY = 0;
    if (rect.right < pad + 48) adjustX = pad + 48 - rect.right;
    if (rect.left > window.innerWidth - pad - 48) {
      adjustX = window.innerWidth - pad - 48 - rect.left;
    }
    if (rect.bottom < pad + 48) adjustY = pad + 48 - rect.bottom;
    if (rect.top < pad) adjustY = pad - rect.top;
    if (adjustX || adjustY) {
      setOffset((current) => ({
        x: current.x + adjustX,
        y: current.y + adjustY,
      }));
    }
  }, []);

  return (
    <div
      ref={panelRef}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={cn(
        "max-h-[min(70vh,32rem)] w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-[5px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] shadow-[var(--shadow-float)] terminal-scroll",
        className,
      )}
      aria-label="Market Pulse signal methodology"
      role="dialog"
    >
      <div
        className="sticky top-0 z-10 flex cursor-grab items-center gap-2 border-b border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripVertical
          aria-hidden="true"
          className="size-3.5 shrink-0 text-[var(--ib-text-muted)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[var(--ib-text-primary)]">
            Signal methodology
          </p>
          <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
            Drag to reposition
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Close methodology"
            className="grid size-7 shrink-0 place-items-center rounded-[4px] border border-[var(--ib-border-control)] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="p-3">
        <p className="text-[11px] leading-5 text-[var(--ib-text-secondary)]">
          {result.methodology}
        </p>
        <div className="mt-3 overflow-x-auto terminal-scroll">
          <table className="w-full min-w-[640px] text-left">
            <thead className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">
              <tr>
                <th className="pb-2 font-medium">Input</th>
                <th className="pb-2 font-medium">Metric</th>
                <th className="pb-2 font-medium">Normalized</th>
                <th className="pb-2 font-medium">Weight</th>
                <th className="pb-2 font-medium">Contribution</th>
                <th className="pb-2 font-medium">Source / timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ib-border-subtle)] text-[10px] text-[var(--ib-text-secondary)]">
              {result.drivers.map((driver) => (
                <tr key={driver.id}>
                  <td className="py-2 pr-4">{driver.label}</td>
                  <td className="py-2 pr-4 font-mono">{driver.metric}</td>
                  <td className="py-2 pr-4 font-mono">
                    {driver.normalizedValue == null
                      ? "—"
                      : driver.normalizedValue.toFixed(3)}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {Math.round(driver.weight * 100)}%
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {driver.contribution == null
                      ? "—"
                      : driver.contribution.toFixed(2)}
                  </td>
                  <td className="py-2 font-mono text-[9px]">
                    {driver.providerName ?? "Derived / unavailable"}
                    {driver.providerTimestamp
                      ? ` · ${driver.providerTimestamp}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[var(--ib-text-muted)]">
          Coverage is {Math.round(result.coverage * 100)}%; a definitive regime
          requires at least {Math.round(result.minimumCoverage * 100)}% weighted
          coverage and two core signals. This is a deterministic market-structure
          heuristic, not a statistical beta, forecast, or causal claim.
        </p>
      </div>
    </div>
  );
}
