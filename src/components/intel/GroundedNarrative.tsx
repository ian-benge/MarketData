"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { attributionTone } from "@/components/news/WhyMovingBadge";
import {
  ATTRIBUTION_LABELS,
  type MoveExplanation,
} from "@/lib/intelligence/types";
import type { DeskIntelEnvelope, MoveNarrative } from "@/lib/desk-intel/types";

export function GroundedNarrative({
  explanation,
  envelope,
  refining = false,
}: {
  explanation?: MoveExplanation;
  envelope: DeskIntelEnvelope<MoveNarrative> | null;
  refining?: boolean;
}) {
  if (!envelope && !explanation) return null;
  const explanationStronger = Boolean(
    explanation &&
      explanation.attribution !== "unknown" &&
      (!envelope || envelope.data.attribution === "unknown"),
  );
  const data = explanationStronger ? undefined : envelope?.data;
  return (
    <div className="space-y-2">
      {envelope && !explanationStronger ? (
        <GenerationMeta envelope={envelope} refining={refining} />
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {data ? (
          <Badge tone={attributionTone(data.attribution)}>
            {ATTRIBUTION_LABELS[data.attribution]}
          </Badge>
        ) : explanation ? (
          <Badge tone={attributionTone(explanation.attribution)}>
            {ATTRIBUTION_LABELS[explanation.attribution]}
          </Badge>
        ) : null}
        {data ? (
          <Badge
            tone={
              data.nature === "fact"
                ? "positive"
                : data.nature === "unknown"
                  ? "neutral"
                  : "warn"
            }
          >
            {data.nature}
          </Badge>
        ) : null}
      </div>
      <p className="text-[13px] leading-5 text-[var(--ib-text-primary)]">
        {data?.headline ?? explanation?.headline}
      </p>
      <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
        {data?.narrative ?? explanation?.detail}
      </p>
      {data?.whyItMatters ? (
        <p className="text-[12px] leading-5 text-[var(--ib-text-secondary)]">
          {data.whyItMatters}
        </p>
      ) : null}
      {data?.relatedTickers.length ? (
        <p className="text-[11px] text-[var(--ib-text-muted)]">
          Related:{" "}
          {data.relatedTickers.map((ticker, index) => (
            <span key={ticker}>
              {index ? ", " : null}
              <Link
                href={`/news?q=${encodeURIComponent(`why is ${ticker} moving today`)}`}
                className="font-mono text-[var(--ib-maroon-300)] hover:underline"
              >
                {ticker}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
      {data?.caveats.filter((caveat) => caveat !== data.narrative).length ? (
        <ul className="space-y-1 text-[11px] text-[var(--ib-text-muted)]">
          {data.caveats
            .filter((caveat) => caveat !== data.narrative)
            .map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
        </ul>
      ) : null}
      {envelope ? (
        <EvidenceChips sourceIds={data?.sourceIds ?? []} sources={envelope.sources} />
      ) : null}
    </div>
  );
}
