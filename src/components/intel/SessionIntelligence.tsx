"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { DeskAsk } from "@/components/intel/DeskAsk";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import { formatSignedPercent } from "@/lib/utils/format";
import type { DeskIntelEnvelope, SessionBrief } from "@/lib/desk-intel/types";

export function SessionIntelligence({
  onSelectSymbol,
}: {
  onSelectSymbol?: (ticker: string) => void;
}) {
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<SessionBrief> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);

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
      title="Desk intelligence"
      description="Grounded in this session’s tape, clustered headlines, coverage, and book. Unknown stays unknown."
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void load(true)}
          disabled={busy}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
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
      {envelope && data ? (
        <div className="space-y-3">
          <GenerationMeta envelope={envelope} refining={refining} />
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-[var(--ib-text-muted)]">
            <span>{data.materialNow.length} material</span>
            <span
              className={
                data.unexplainedTape.length
                  ? "text-[var(--ib-text-primary)]"
                  : undefined
              }
            >
              {data.unexplainedTape.length} unexplained
            </span>
            <span>{data.bookFlags.length} in book</span>
            {data.themes.length ? <span>{data.themes.length} themes</span> : null}
          </div>
          <p className="text-[13px] font-medium leading-5 text-[var(--ib-text-primary)]">
            {data.headline}
          </p>
          <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
            {data.sessionRead}
          </p>
          {data.materialNow.length ? (
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Material now
              </h3>
              <ul className="mt-1.5 space-y-2">
                {data.materialNow.map((claim) => (
                  <li key={claim.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={claim.nature === "fact" ? "positive" : "info"}>
                        {claim.nature}
                      </Badge>
                      {claim.tickers.map((ticker) => (
                        <button
                          key={ticker}
                          type="button"
                          className="font-mono text-[11px] text-[var(--ib-maroon-300)] hover:underline"
                          onClick={() => onSelectSymbol?.(ticker)}
                        >
                          {ticker}
                        </button>
                      ))}
                    </div>
                    <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
                      {claim.text}
                    </p>
                    <EvidenceChips sourceIds={claim.sourceIds} sources={envelope.sources} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.unexplainedTape.length ? (
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Unexplained tape
              </h3>
              <ul className="mt-1.5 space-y-1">
                {data.unexplainedTape.map((row) => (
                  <li
                    key={row.ticker}
                    className="flex flex-wrap items-baseline gap-2 text-[12px]"
                  >
                    <button
                      type="button"
                      className="font-mono text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                      onClick={() => onSelectSymbol?.(row.ticker)}
                    >
                      {row.ticker}
                    </button>
                    <span className="font-mono text-[var(--ib-text-muted)]">
                      {formatSignedPercent(row.changePercent)}
                    </span>
                    <span className="text-[var(--ib-text-secondary)]">{row.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.bookFlags.length ? (
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                In the book
              </h3>
              <ul className="mt-1.5 space-y-1 text-[12px] text-[var(--ib-text-secondary)]">
                {data.bookFlags.map((row) => (
                  <li key={row.ticker}>
                    <button
                      type="button"
                      className="mr-2 font-mono text-[var(--ib-text-primary)] hover:text-[var(--ib-maroon-300)]"
                      onClick={() => onSelectSymbol?.(row.ticker)}
                    >
                      {row.ticker}
                    </button>
                    {row.note}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.themes.length ? (
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Themes
              </h3>
              <ul className="mt-1.5 space-y-1 text-[12px] text-[var(--ib-text-secondary)]">
                {data.themes.map((theme) => (
                  <li key={theme.id}>{theme.note}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.watchItems.length ? (
            <p className="text-[12px] text-[var(--ib-text-secondary)]">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Watch
              </span>{" "}
              {data.watchItems.join(" · ")}
            </p>
          ) : null}
          {data.unresolvedQuestions.length || data.gaps.length ? (
            <details>
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
                Open questions and coverage notes
              </summary>
              <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--ib-text-muted)]">
                {data.unresolvedQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {data.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <DeskAsk compact />
        </div>
      ) : error ? (
        <DeskAsk compact />
      ) : null}
    </Panel>
  );
}
