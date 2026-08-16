"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EvidenceChips } from "@/components/intel/EvidenceChips";
import { GenerationMeta } from "@/components/intel/GenerationMeta";
import { fetchIntelProgressive } from "@/components/intel/fetch";
import { cn } from "@/lib/utils/cn";
import type { AskAnswer, DeskIntelEnvelope } from "@/lib/desk-intel/types";

export function DeskAsk({
  initialQuestion = "",
  compact = false,
}: {
  initialQuestion?: string;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<DeskIntelEnvelope<AskAnswer> | null>(
    null,
  );
  const [refining, setRefining] = useState(false);

  async function submitQuestion(raw: string) {
    const next = raw.trim();
    if (next.length < 3) return;
    setBusy(true);
    setError(null);
    setRefining(false);
    let painted = false;
    const result = await fetchIntelProgressive<DeskIntelEnvelope<AskAnswer>>({
      url: "/api/intel/ask",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: next }),
      },
      rulesInit: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: next, rulesOnly: true }),
      },
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
    setQuestion(initialQuestion);
    if (initialQuestion.trim().length >= 3) {
      void submitQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  return (
    <div className="space-y-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuestion(question);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="min-w-[12rem] flex-1">
          <label htmlFor={compact ? "desk-ask-compact" : "desk-ask"} className="sr-only">
            Ask this session
          </label>
          <input
            id={compact ? "desk-ask-compact" : "desk-ask"}
            className={cn("field-control", compact && "h-8 py-0")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              compact
                ? "Ask this session’s evidence…"
                : "Ask only what this session’s tape, news, and book can support"
            }
          />
        </div>
        <Button type="submit" size="sm" variant="primary" disabled={busy}>
          {busy ? "Grounding…" : "Ask"}
        </Button>
      </form>
      {error ? (
        <p className="text-[12px] text-[var(--market-negative)]">{error}</p>
      ) : null}
      {envelope ? (
        <div className="space-y-2 border-t border-[var(--ib-border-subtle)] pt-2">
          <GenerationMeta envelope={envelope} refining={refining} />
          <Badge
            tone={
              envelope.data.nature === "fact"
                ? "positive"
                : envelope.data.nature === "insufficient_evidence"
                  ? "warn"
                  : "info"
            }
          >
            {envelope.data.nature.replaceAll("_", " ")}
          </Badge>
          <p className="text-[13px] leading-5 text-[var(--ib-text-secondary)]">
            {envelope.data.answer}
          </p>
          <EvidenceChips
            sourceIds={envelope.data.sourceIds}
            sources={envelope.sources}
          />
          {envelope.data.followUps.length ? (
            <div className="flex flex-wrap gap-1.5">
              {envelope.data.followUps.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-[3px] border border-[var(--ib-border-subtle)] px-2 py-1 text-[11px] text-[var(--ib-text-secondary)] hover:text-[var(--ib-text-primary)]"
                  onClick={() => {
                    setQuestion(item);
                    void submitQuestion(item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
