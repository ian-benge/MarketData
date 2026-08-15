import Link from "next/link";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import {
  ATTRIBUTION_COMPACT_LABELS,
  ATTRIBUTION_LABELS,
  type MoveExplanation,
} from "@/lib/intelligence/types";
import { cn } from "@/lib/utils/cn";

export function attributionTone(
  attribution: MoveExplanation["attribution"] | null | undefined,
): BadgeProps["tone"] {
  if (attribution === "confirmed_company") return "positive";
  if (attribution === "likely_catalyst" || attribution === "multiple") return "info";
  if (attribution === "sympathy") return "warn";
  return "neutral";
}

export function WhyMovingBadge({
  explanation,
  compact = false,
  href,
}: {
  explanation: MoveExplanation | null | undefined;
  compact?: boolean;
  href?: string;
}) {
  if (!explanation) {
    return <span className="text-[11px] text-[var(--ib-text-muted)]">—</span>;
  }
  const label = compact
    ? ATTRIBUTION_COMPACT_LABELS[explanation.attribution]
    : ATTRIBUTION_LABELS[explanation.attribution];
  const inner = (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <Badge tone={attributionTone(explanation.attribution)}>{label}</Badge>
      {compact || explanation.attribution === "unknown" ? null : (
        <span className="min-w-0 truncate text-[11px] text-[var(--ib-text-secondary)]">
          {explanation.supportingEvents[0]?.title ?? explanation.headline}
        </span>
      )}
    </span>
  );
  if (!href) return inner;
  return (
    <Link
      href={href}
      className={cn(
        "min-w-0 hover:text-[var(--ib-maroon-300)]",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {inner}
    </Link>
  );
}
