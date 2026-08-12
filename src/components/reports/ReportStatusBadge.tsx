import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { formatReportStatus } from "@/components/reports/report-format";

type StatusTreatment = {
  icon: LucideIcon;
  className: string;
};

const runningStatuses = new Set([
  "queued",
  "collecting_sources",
  "normalizing_market_data",
  "detecting_material_events",
  "analyzing_and_drafting",
  "validating_claims",
  "rendering_pdf",
  "archiving",
  "delivering_email",
]);

function treatmentFor(status: string): StatusTreatment {
  const normalized = status.toLowerCase();

  if (normalized === "completed") {
    return {
      icon: CheckCircle2,
      className:
        "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-secondary)]",
    };
  }
  if (normalized === "partial") {
    return {
      icon: TriangleAlert,
      className:
        "border-[color-mix(in_oklab,var(--state-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--state-warning)_12%,transparent)] text-[var(--state-warning)]",
    };
  }
  if (normalized === "failed") {
    return {
      icon: CircleX,
      className:
        "border-[color-mix(in_oklab,var(--market-negative)_45%,transparent)] bg-[color-mix(in_oklab,var(--market-negative)_12%,transparent)] text-[var(--market-negative)]",
    };
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return {
      icon: Ban,
      className:
        "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-muted)]",
    };
  }
  if (runningStatuses.has(normalized)) {
    return {
      icon: CircleDashed,
      className:
        "border-[color-mix(in_oklab,var(--state-info)_40%,transparent)] bg-[color-mix(in_oklab,var(--state-info)_10%,transparent)] text-[var(--state-info)]",
    };
  }

  return {
    icon: CircleDashed,
    className:
      "border-[var(--ib-border-strong)] bg-[var(--ib-surface-2)] text-[var(--ib-text-muted)]",
  };
}

export function ReportStatusBadge({ status }: { status: string }) {
  const treatment = treatmentFor(status);
  const Icon = treatment.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${treatment.className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
      {formatReportStatus(status)}
    </span>
  );
}
