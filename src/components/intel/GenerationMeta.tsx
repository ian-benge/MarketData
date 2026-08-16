import { Badge } from "@/components/ui/Badge";
import type { DeskIntelEnvelope } from "@/lib/desk-intel/types";

/** Operational / expected codes — not trader-facing grounding failures. */
const QUIET_WARNING_CODES = new Set(["unknown_not_narrated"]);
const MODEL_FAILED_CODES = new Set(["model_unavailable"]);

export function GenerationMeta<T>({
  envelope,
  refining = false,
}: {
  envelope: Pick<
    DeskIntelEnvelope<T>,
    "method" | "model" | "generatedAt" | "cached" | "warnings"
  >;
  refining?: boolean;
}) {
  const modelFailed = envelope.warnings.some((warning) =>
    MODEL_FAILED_CODES.has(warning.code),
  );
  const notes = envelope.warnings.filter(
    (warning) =>
      !QUIET_WARNING_CODES.has(warning.code) &&
      !MODEL_FAILED_CODES.has(warning.code),
  );

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={envelope.method === "model" ? "brand" : "neutral"}>
          {envelope.method === "model" ? "Model synthesis" : "Rules compilation"}
        </Badge>
        {modelFailed ? <Badge tone="warn">Model failed</Badge> : null}
        {envelope.cached ? <Badge tone="info">Cached</Badge> : null}
        {envelope.model ? (
          <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
            {envelope.model}
          </span>
        ) : null}
        <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
          {envelope.generatedAt.slice(11, 19)}Z
        </span>
        {refining ? (
          <span className="font-mono text-[10px] text-[var(--ib-text-muted)]">
            Refining…
          </span>
        ) : null}
        {notes.length ? (
          <details className="inline">
            <summary className="cursor-pointer list-none">
              <Badge tone="warn">
                {notes.length} grounding note
                {notes.length === 1 ? "" : "s"}
              </Badge>
            </summary>
            <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--ib-text-muted)]">
              {notes.map((warning) => (
                <li key={`${warning.code}-${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
