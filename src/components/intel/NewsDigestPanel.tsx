"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import type { DeskIntelEnvelope, NewsDigest } from "@/lib/desk-intel/types";

export function NewsDigestPanel({ query }: { query: string }) {
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<NewsDigest> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRefining(false);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      let painted = false;
      const result = await fetchIntelProgressive<DeskIntelEnvelope<NewsDigest>>({
        url: `/api/intel/digest?${params.toString()}`,
        onUpdate: (data, phase) => {
          if (cancelled) return;
          painted = true;
          setEnvelope(data);
          setRefining(phase === "rules");
        },
      });
      if (cancelled) return;
      if (!result.ok && !painted) setError(result.error);
      setRefining(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, reload]);

  if (error && !envelope) {
    return (
      <Panel title="What’s material" description="Digest of the current headline set.">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-[var(--ib-text-secondary)]">{error}</p>
          <Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>
            Retry
          </Button>
        </div>
      </Panel>
    );
  }

  if (!envelope) {
    return (
      <Panel title="What’s material">
        <p className="text-[12px] text-[var(--ib-text-muted)]">Compiling the digest…</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="What’s material"
      description="Digest of the current headline set. Citations only."
    >
      <div className="space-y-2">
        <GenerationMeta envelope={envelope} refining={refining} />
        <p className="text-[13px] font-medium text-[var(--ib-text-primary)]">
          {envelope.data.headline}
        </p>
        <ul className="space-y-2">
          {envelope.data.bullets.map((bullet) => (
            <li key={bullet.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={bullet.nature === "fact" ? "positive" : "info"}>
                  {bullet.nature}
                </Badge>
                {bullet.tickers.map((ticker) => (
                  <Link
                    key={ticker}
                    href={`/news?q=${encodeURIComponent(`why is ${ticker} moving today`)}`}
                    className="font-mono text-[11px] text-[var(--ib-maroon-300)] hover:underline"
                  >
                    {ticker}
                  </Link>
                ))}
              </div>
              <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
                {bullet.text}
              </p>
              <EvidenceChips sourceIds={bullet.sourceIds} sources={envelope.sources} />
            </li>
          ))}
        </ul>
        {envelope.data.clusters.length ? (
          <ul className="space-y-1 text-[11px] text-[var(--ib-text-muted)]">
            {envelope.data.clusters.map((cluster) => (
              <li key={cluster.title}>
                {cluster.title}: {cluster.note}
              </li>
            ))}
          </ul>
        ) : null}
        {envelope.data.unresolvedQuestions.length ? (
          <ul className="space-y-1 text-[11px] text-[var(--ib-text-muted)]">
            {envelope.data.unresolvedQuestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}
