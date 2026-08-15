"use client";

import { useEffect, useState } from "react";
import { GroundedNarrative } from "@/components/intel/GroundedNarrative";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import type { MoveExplanation } from "@/lib/intelligence/types";
import type { DeskIntelEnvelope, MoveNarrative } from "@/lib/desk-intel/types";

export function MoveNarrativeLoader({
  ticker,
  explanation,
}: {
  ticker: string;
  explanation?: MoveExplanation;
}) {
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<MoveNarrative> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEnvelope(null);
    setPending(true);
    setError(null);
    setRefining(false);
    void (async () => {
      let painted = false;
      const result = await fetchIntelProgressive<DeskIntelEnvelope<MoveNarrative>>({
        url: `/api/intel/move?ticker=${encodeURIComponent(ticker)}`,
        onUpdate: (data, phase) => {
          if (cancelled) return;
          painted = true;
          setEnvelope(data);
          setPending(false);
          setRefining(phase === "rules");
        },
      });
      if (cancelled) return;
      setPending(false);
      setRefining(false);
      if (!result.ok && !painted) setError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (error && !envelope && !explanation) {
    return <p className="text-[11px] text-[var(--ib-text-secondary)]">{error}</p>;
  }

  if (!envelope && !explanation) {
    return pending ? (
      <p className="text-[11px] text-[var(--ib-text-muted)]">
        Retrieving grounded narrative…
      </p>
    ) : null;
  }

  return (
    <GroundedNarrative
      explanation={explanation}
      envelope={envelope}
      refining={refining}
    />
  );
}
