"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { AttentionItem } from "@/lib/market-data/overview-attention";
import { cn } from "@/lib/utils/cn";

function ToneIcon({ print }: { print: string }) {
  if (print.includes("−")) {
    return (
      <ArrowDownRight
        aria-hidden="true"
        className="size-3 shrink-0 text-[var(--market-negative)]"
      />
    );
  }
  if (print.includes("+")) {
    return (
      <ArrowUpRight
        aria-hidden="true"
        className="size-3 shrink-0 text-[var(--market-positive)]"
      />
    );
  }
  return (
    <ArrowRight
      aria-hidden="true"
      className="size-3 shrink-0 text-[var(--market-unchanged)]"
    />
  );
}

const KIND_RAIL: Record<AttentionItem["kind"], string> = {
  event: "bg-[var(--state-warning)]",
  mover: "bg-[var(--ib-maroon-500)]",
  rvol: "bg-[var(--state-warning)]",
  driver: "bg-[var(--ib-maroon-300)]",
  sector: "bg-[var(--state-info)]",
  coverage: "bg-[var(--ib-maroon-300)]",
};

export function AttentionStrip({
  items,
  onSelectSymbol,
}: {
  items: AttentionItem[];
  onSelectSymbol?: (ticker: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section
      aria-label="Attention"
      className="overflow-hidden rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)]"
    >
      <div className="flex min-w-0">
        <p className="hidden shrink-0 items-center border-r border-[var(--ib-border-subtle)] px-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ib-maroon-300)] sm:flex">
          Attention
        </p>
        <ol className="flex min-w-0 flex-1 divide-x divide-[var(--ib-border-subtle)] overflow-x-auto terminal-scroll">
          {items.map((item, index) => {
            const clickable = Boolean(item.ticker && onSelectSymbol);
            const inner = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-0.5 rounded-r",
                    KIND_RAIL[item.kind],
                    index === 0 ? "opacity-100" : "opacity-70",
                  )}
                />
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">
                  {item.kicker}
                </p>
                <p
                  className={cn(
                    "mt-1 flex items-start gap-1 text-[12px] leading-4",
                    index === 0
                      ? "font-medium text-[var(--ib-text-primary)]"
                      : "text-[var(--ib-text-primary)]",
                  )}
                >
                  <ToneIcon print={item.print} />
                  <span className="min-w-0 truncate">{item.print}</span>
                </p>
              </>
            );
            return (
              <li
                key={item.id}
                className="relative min-w-[9.5rem] flex-1 sm:min-w-[11.5rem]"
              >
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onSelectSymbol?.(item.ticker!)}
                    className="h-full w-full min-h-11 px-2.5 py-1.5 pl-3 text-left transition-colors hover:bg-[var(--ib-surface-hover)] sm:px-3 sm:py-2 sm:pl-3.5"
                    aria-label={`Select ${item.ticker}`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="px-2.5 py-1.5 pl-3 sm:px-3 sm:py-2 sm:pl-3.5">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
