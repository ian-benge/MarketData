"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import { formatCurrency, formatSignedPercent } from "@/lib/utils/format";
import type { BookRisk, DeskIntelEnvelope } from "@/lib/desk-intel/types";

function severityTone(severity: BookRisk["items"][number]["severity"]) {
  if (severity === "high") return "warn" as const;
  if (severity === "medium") return "info" as const;
  return "neutral" as const;
}

export function BookRiskPanel({
  openTickers = [],
}: {
  openTickers?: string[];
}) {
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<BookRisk> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(refresh = false) {
      if (!refresh) setRefining(false);
      let painted = false;
      const result = await fetchIntelProgressive<DeskIntelEnvelope<BookRisk>>({
        url: "/api/intel/book-risk",
        refresh,
        onUpdate: (data, phase) => {
          if (cancelled) return;
          painted = true;
          setEnvelope(data);
          setError(null);
          setRefining(!refresh && phase === "rules");
        },
      });
      if (cancelled) return;
      if (!result.ok && !painted && !refresh) setError(result.error);
      setRefining(false);
    }
    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (error) {
    return (
      <Panel title="Book risk" description="Overlap of open lots with unexplained tape and catalysts.">
        <p className="text-[12px] text-[var(--ib-text-secondary)]">{error}</p>
      </Panel>
    );
  }
  if (!envelope) {
    return (
      <p className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2 text-[12px] text-[var(--ib-text-muted)]">
        Scoring the book against this session…
      </p>
    );
  }

  const symbols = new Set(
    openTickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
  );
  const items = envelope.data.items.filter((item) => {
    if (item.ticker === "BOOK") return symbols.size === 0;
    return symbols.has(item.ticker.toUpperCase());
  });

  if (!items.length) {
    return (
      <p className="rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-1)] px-3 py-2 text-[12px] text-[var(--ib-text-muted)]">
        No significant tape overlap on this book's open lots.
      </p>
    );
  }

  return (
    <Panel
      title="Book risk"
      description="Open lots versus significant tape and cited catalysts. P&L numbers come from the book, not the model."
    >
      <div className="space-y-2">
        <GenerationMeta envelope={envelope} refining={refining} />
        {envelope.data.ownerLocked ? (
          <p className="text-[11px] text-[var(--ib-text-muted)]">
            Account metrics are locked. Scoring tape overlap only.
          </p>
        ) : null}
        {envelope.data.headline &&
        items.some((item) =>
          envelope.data.headline.toUpperCase().includes(item.ticker),
        ) ? (
          <p className="text-[13px] font-medium text-[var(--ib-text-primary)]">
            {envelope.data.headline}
          </p>
        ) : items.length ? (
          <p className="text-[13px] font-medium text-[var(--ib-text-primary)]">
            Tape overlap on open lots in this book.
          </p>
        ) : null}
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.ticker}`} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.ticker === "BOOK" ? (
                  <span className="font-mono text-[12px] text-[var(--ib-text-primary)]">
                    {item.ticker}
                  </span>
                ) : (
                  <Link
                    href={`/news?q=${encodeURIComponent(`why is ${item.ticker} moving today`)}`}
                    className="font-mono text-[12px] text-[var(--ib-maroon-300)] hover:underline"
                  >
                    {item.ticker}
                  </Link>
                )}
                <Badge tone={severityTone(item.severity)}>{item.severity}</Badge>
                <Badge tone="neutral">{item.kind.replaceAll("_", " ")}</Badge>
                {item.changePercent != null ? (
                  <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                    {formatSignedPercent(item.changePercent)}
                  </span>
                ) : null}
                {item.dayPnl != null ? (
                  <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">
                    {formatCurrency(item.dayPnl)}
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] text-[var(--ib-text-secondary)]">{item.note}</p>
              <EvidenceChips sourceIds={item.sourceIds} sources={envelope.sources} />
            </li>
          ))}
        </ul>
          {envelope.data.gaps.length ? (
            <ul className="space-y-1 text-[11px] text-[var(--ib-text-muted)]">
              {envelope.data.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          ) : null}
      </div>
    </Panel>
  );
}
