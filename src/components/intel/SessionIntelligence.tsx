"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { DeskAsk } from "@/components/intel/DeskAsk";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent, marketToneClass } from "@/lib/utils/format";
import {
  UNKNOWN_MOVE_COPY,
  type ClaimNature,
  type DeskIntelEnvelope,
  type SessionBrief,
} from "@/lib/desk-intel/types";

const CLAIM_NATURE_COPY: Record<
  ClaimNature,
  { label: string; title: string; tone: "positive" | "info" | "neutral" }
> = {
  fact: {
    label: "Primary",
    title: "Primary source: filing, press release, or exchange wire",
    tone: "positive",
  },
  inference: {
    label: "Secondary",
    title: "Secondary source: clustered headline, not a company filing",
    tone: "info",
  },
  unknown: {
    label: "Unknown",
    title: "No verified source in this evidence window",
    tone: "neutral",
  },
};

function tapeMembership(note: string): "book" | "coverage" | null {
  const lower = note.toLowerCase();
  if (lower.includes("in book")) return "book";
  if (lower.includes("coverage")) return "coverage";
  return null;
}

function bookAside(ticker: string, note: string): string | null {
  const next = note
    .replace(new RegExp(`\\b${ticker}\\b`, "gi"), "")
    .replace(/is in the book and [^.]*\.?/gi, "")
    .replace(UNKNOWN_MOVE_COPY, "")
    .replace(/with no verified catalyst in window\.?/gi, "")
    .replace(/^\s*·\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return next || null;
}

function looksLikeTicker(value: string) {
  return /^[A-Z]{1,5}$/.test(value.trim());
}

function SectionLabel({
  title,
  hint,
  count,
}: {
  title: string;
  hint?: string;
  count?: number;
}) {
  return (
    <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ib-text-muted)]">
      <span>{title}</span>
      {count != null ? (
        <span className="tabular-nums text-[var(--ib-text-secondary)]">{count}</span>
      ) : null}
      {hint ? (
        <span className="font-sans normal-case tracking-normal text-[10px] text-[var(--ib-text-muted)]">
          {hint}
        </span>
      ) : null}
    </h3>
  );
}

export function SessionIntelligence({
  onSelectSymbol,
  compact = false,
}: {
  onSelectSymbol?: (ticker: string) => void;
  compact?: boolean;
}) {
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<SessionBrief> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  async function load(refresh = false) {
    setBusy(true);
    setError(null);
    if (!refresh) setRefining(false);
    let painted = false;
    const result = await fetchIntelProgressive<DeskIntelEnvelope<SessionBrief>>({
      url: refresh ? "/api/intel/session?refresh=1" : "/api/intel/session",
      refresh,
      onUpdate: (data, phase) => {
        painted = true;
        setEnvelope(data);
        setRefining(phase === "rules");
        if (phase === "rules") setBusy(false);
      },
    });
    if (!result.ok && !painted) setError(result.error);
    setRefining(false);
    setBusy(false);
  }

  useEffect(() => {
    void load(false);
  }, []);

  const data = envelope?.data;
  return (
    <Panel
      id="desk-intelligence"
      title="Desk intelligence"
      description={
        compact
          ? "Material headlines vs coverage and the book."
          : "Material headlines joined to coverage and the book. Unexplained tape stays unexplained."
      }
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {compact ? (
            <ChipToggle
              pressed={expanded}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="normal-case tracking-[0.08em]"
            >
              {expanded ? "Collapse" : "Expand"}
            </ChipToggle>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            title="Pull live wires and rebuild the session brief"
            onClick={() => void load(true)}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="text-[12px] text-[var(--ib-text-secondary)]">{error}</p>
      ) : null}
      {!envelope && !error ? (
        <p className="text-[12px] text-[var(--ib-text-muted)]">
          Compiling the session brief…
        </p>
      ) : null}
      {envelope && data && compact && !expanded ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GenerationMeta envelope={envelope} refining={refining} />
            <div className="flex flex-wrap gap-1">
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ib-text-muted)]">
                {data.materialNow.length} material
              </span>
              <span
                className={cn(
                  "rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  data.unexplainedTape.length
                    ? "border-[color-mix(in_oklab,var(--state-warning)_38%,var(--ib-border-subtle))] text-[var(--state-warning)]"
                    : "border-[var(--ib-border-subtle)] text-[var(--ib-text-muted)]",
                )}
              >
                {data.unexplainedTape.length} unexplained
              </span>
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ib-text-muted)]">
                {data.bookFlags.length} in book
              </span>
            </div>
          </div>
          <p className="text-[13px] font-medium leading-5 text-[var(--ib-text-primary)]">
            {data.headline}
          </p>
          <p className="text-[11px] leading-4 text-[var(--ib-text-secondary)]">
            {data.sessionRead}
          </p>
          {data.unexplainedTape.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {data.unexplainedTape.slice(0, 6).map((row) => (
                <li key={row.ticker}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5"
                    onClick={() => onSelectSymbol?.(row.ticker)}
                  >
                    <span className="font-mono text-[11px] text-[var(--ib-text-primary)]">
                      {row.ticker}
                    </span>
                    <span className={cn("font-mono text-[11px]", marketToneClass(row.changePercent))}>
                      {formatSignedPercent(row.changePercent)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {envelope && data && (!compact || expanded) ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GenerationMeta envelope={envelope} refining={refining} />
            <div className="flex flex-wrap gap-1">
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ib-text-muted)]">
                {data.materialNow.length} material
              </span>
              <span
                className={cn(
                  "rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                  data.unexplainedTape.length
                    ? "border-[color-mix(in_oklab,var(--state-warning)_38%,var(--ib-border-subtle))] text-[var(--state-warning)]"
                    : "border-[var(--ib-border-subtle)] text-[var(--ib-text-muted)]",
                )}
              >
                {data.unexplainedTape.length} unexplained
              </span>
              <span className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ib-text-muted)]">
                {data.bookFlags.length} in book
              </span>
            </div>
          </div>

          <div>
            <p className="text-[13px] font-medium leading-5 text-[var(--ib-text-primary)]">
              {data.headline}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--ib-text-secondary)]">
              {data.sessionRead}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-12">
            {data.materialNow.length ? (
              <section className="min-w-0 lg:col-span-7">
                <SectionLabel
                  title="Material now"
                  count={data.materialNow.length}
                  hint="Tagged to coverage or the book"
                />
                <ul className="mt-1.5 divide-y divide-[var(--ib-border-subtle)] border-y border-[var(--ib-border-subtle)]">
                  {data.materialNow.map((claim) => {
                    const nature = CLAIM_NATURE_COPY[claim.nature];
                    return (
                      <li
                        key={claim.id}
                        className="flex items-center gap-2 py-1.5"
                      >
                        <Badge
                          tone={nature.tone}
                          title={nature.title}
                          className="shrink-0"
                        >
                          {nature.label}
                        </Badge>
                        <div className="flex w-14 shrink-0 flex-wrap gap-x-1">
                          {claim.tickers.map((ticker) => (
                            <button
                              key={ticker}
                              type="button"
                              className="font-mono text-[11px] font-semibold text-[var(--ib-maroon-300)] hover:underline"
                              onClick={() => onSelectSymbol?.(ticker)}
                            >
                              {ticker}
                            </button>
                          ))}
                        </div>
                        <p
                          className="min-w-0 flex-1 truncate text-[12px] leading-4 text-[var(--ib-text-secondary)]"
                          title={claim.text}
                        >
                          {claim.text}
                        </p>
                        <EvidenceChips
                          compact
                          sourceIds={claim.sourceIds}
                          sources={envelope.sources}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <div
              className={cn(
                "min-w-0 space-y-3",
                data.materialNow.length ? "lg:col-span-5" : "lg:col-span-12",
              )}
            >
              {data.unexplainedTape.length ? (
                <section>
                  <SectionLabel
                    title="Unexplained tape"
                    count={data.unexplainedTape.length}
                    hint="No verified catalyst in window"
                  />
                  <ul className="mt-1.5 divide-y divide-[var(--ib-border-subtle)] border-y border-[var(--ib-border-subtle)]">
                    {data.unexplainedTape.map((row) => {
                      const membership = tapeMembership(row.note);
                      return (
                        <li
                          key={row.ticker}
                          className="flex items-center gap-2 py-1.5"
                          title={row.note}
                        >
                          <button
                            type="button"
                            className="w-14 shrink-0 text-left font-mono text-[12px] font-semibold text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                            onClick={() => onSelectSymbol?.(row.ticker)}
                          >
                            {row.ticker}
                          </button>
                          <span
                            className={cn(
                              "w-16 shrink-0 font-mono text-[12px] tabular-nums",
                              marketToneClass(row.changePercent),
                            )}
                          >
                            {formatSignedPercent(row.changePercent)}
                          </span>
                          {membership ? (
                            <Badge
                              tone={membership === "book" ? "warn" : "neutral"}
                            >
                              {membership === "book" ? "In book" : "Coverage"}
                            </Badge>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {data.bookFlags.length ? (
                <section>
                  <SectionLabel
                    title="In the book"
                    count={data.bookFlags.length}
                    hint="Positions moving this session"
                  />
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {data.bookFlags.map((row) => {
                      const aside = bookAside(row.ticker, row.note);
                      return (
                        <li key={row.ticker}>
                          <button
                            type="button"
                            title={row.note}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2 py-1 text-left hover:border-[var(--ib-border-control)]"
                            onClick={() => onSelectSymbol?.(row.ticker)}
                          >
                            <span className="font-mono text-[11px] font-semibold text-[var(--ib-text-primary)]">
                              {row.ticker}
                            </span>
                            {aside ? (
                              <span className="truncate text-[10px] text-[var(--ib-text-muted)]">
                                {aside}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {data.watchItems.length ? (
                <section>
                  <SectionLabel
                    title="Watch"
                    count={data.watchItems.length}
                    hint="Next calendar prints"
                  />
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {data.watchItems.map((item) => {
                      const ticker = looksLikeTicker(item);
                      return (
                        <li key={item}>
                          {ticker ? (
                            <button
                              type="button"
                              className="rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ib-text-primary)] hover:border-[var(--ib-border-control)]"
                              onClick={() => onSelectSymbol?.(item)}
                            >
                              {item}
                            </button>
                          ) : (
                            <span className="inline-block rounded-[3px] border border-[var(--ib-border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ib-text-secondary)]">
                              {item}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>

          {data.unresolvedQuestions.length || data.gaps.length ? (
            <details className="rounded-[4px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-2.5 py-1.5">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Open questions and coverage notes
              </summary>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-[var(--ib-text-muted)]">
                {data.unresolvedQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {data.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="border-t border-[var(--ib-border-subtle)] pt-2">
            <DeskAsk compact />
          </div>
        </div>
      ) : error ? (
        <DeskAsk compact />
      ) : null}
    </Panel>
  );
}
