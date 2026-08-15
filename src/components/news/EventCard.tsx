"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { IntelligenceEvent } from "@/lib/intelligence/types";
import {
  EVENT_TYPE_LABELS,
  NOVELTY_LABELS,
  CONFIDENCE_LABELS,
} from "@/lib/intelligence/types";
import { cn } from "@/lib/utils/cn";
import { formatMarketTime, formatSignedPercent } from "@/lib/utils/format";

export function EventCard({
  event,
  coverageTickers,
  selected,
  onSelectTicker,
  onOpen,
}: {
  event: IntelligenceEvent;
  coverageTickers?: ReadonlySet<string>;
  selected?: boolean;
  onSelectTicker?: (ticker: string) => void;
  onOpen?: (event: IntelligenceEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const onCoverage = event.tickers.some((entity) =>
    coverageTickers?.has(entity.ticker),
  );
  return (
    <article
      className={cn(
        "relative border-b border-[var(--ib-border-subtle)] px-3 py-2.5 last:border-0",
        onCoverage &&
          "bg-[color-mix(in_oklab,var(--ib-maroon-500)_5%,transparent)]",
        selected && "bg-[var(--ib-surface-selected)]",
      )}
    >
      {onCoverage ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-0.5 bg-[var(--ib-maroon-500)]"
        />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[88px_minmax(0,1fr)]">
        <div className="font-mono text-[10px] leading-4 text-[var(--ib-text-muted)]">
          <time dateTime={event.publishedAt} className="block text-[var(--ib-text-secondary)]">
            {formatMarketTime(event.publishedAt)}
          </time>
          <span className="mt-0.5 block">{event.eventTypeLabel}</span>
          <span className="block truncate">
            {event.representative.publisher ?? event.representative.providerName}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <a
              href={event.representative.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group min-w-0 flex-1 text-[13px] font-semibold leading-5 text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
            >
              <span>{event.title}</span>
              <ExternalLink
                aria-hidden="true"
                className="ml-1.5 inline size-3 text-[var(--ib-text-muted)] group-hover:text-[var(--ib-maroon-300)]"
              />
            </a>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-[4px] text-[var(--ib-text-muted)] hover:bg-[var(--ib-surface-hover)]"
              aria-expanded={open}
              aria-label={open ? "Hide related headlines" : "Show related headlines"}
              onClick={() => {
                setOpen((value) => !value);
                onOpen?.(event);
              }}
            >
              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
            </button>
          </div>
          {event.summary ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--ib-text-secondary)]">
              {event.summary}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              tone={event.materialityScore >= 70 ? "brand" : "neutral"}
            >
              M{event.materialityScore}
            </Badge>
            <Badge tone="neutral">{NOVELTY_LABELS[event.novelty]}</Badge>
            <Badge tone="info">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
            <Badge tone={event.confidence === "unknown" ? "warn" : "neutral"}>
              {CONFIDENCE_LABELS[event.confidence]}
            </Badge>
            {event.memberCount > 1 ? (
              <Badge tone="brand">{event.memberCount} sources</Badge>
            ) : null}
            {event.sentiment !== "unscored" ? (
              <Badge
                tone={
                  event.sentiment === "positive"
                    ? "positive"
                    : event.sentiment === "negative"
                      ? "negative"
                      : "warn"
                }
              >
                {event.sentiment}
              </Badge>
            ) : null}
            {onCoverage ? <Badge tone="brand">On coverage</Badge> : null}
            {event.marketReaction.slice(0, 2).map((row) => (
              <Badge
                key={`rx-${row.ticker}`}
                tone={
                  row.changePercent == null
                    ? "neutral"
                    : row.changePercent < 0
                      ? "negative"
                      : "positive"
                }
              >
                {row.ticker} {formatSignedPercent(row.changePercent)}
              </Badge>
            ))}
            {event.tickers.slice(0, 6).map((entity) => (
              <button
                key={entity.ticker}
                type="button"
                onClick={() => onSelectTicker?.(entity.ticker)}
                className="inline-flex min-h-7 max-sm:min-h-11 items-center"
                aria-label={`Filter headlines to ${entity.ticker}`}
              >
                <Badge tone={entity.role === "primary" ? "info" : "neutral"}>
                  {entity.ticker}
                </Badge>
              </button>
            ))}
            {event.themes.slice(0, 3).map((theme) => (
              <Badge key={theme} tone="neutral">
                {theme.replaceAll("_", " ")}
              </Badge>
            ))}
            {event.secondOrder.slice(0, 3).map((entity) => (
              <Badge key={`so-${entity.ticker}`} tone="neutral">
                2nd {entity.ticker}
              </Badge>
            ))}
          </div>
          {open ? (
            <ul className="mt-2 space-y-1.5 border-t border-[var(--ib-border-subtle)] pt-2">
              {event.sources.map((source) => (
                <li key={source.id} className="text-[12px] text-[var(--ib-text-secondary)]">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--ib-text-primary)]"
                  >
                    {source.publisher ?? source.providerName}: {source.title}
                  </a>
                  <span className="ml-2 font-mono text-[10px] text-[var(--ib-text-muted)]">
                    {formatMarketTime(source.publishedAt)}
                  </span>
                </li>
              ))}
              {event.coverageNotes ? (
                <li className="text-[11px] text-[var(--ib-text-muted)]">{event.coverageNotes}</li>
              ) : null}
              {event.sentimentNote ? (
                <li className="text-[11px] text-[var(--ib-text-muted)]">{event.sentimentNote}</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}
