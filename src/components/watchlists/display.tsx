import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import {
  formatSignedPercent,
  marketTone,
} from "@/lib/utils/format";
import type { CoverageFlag } from "@/lib/watchlists/types";

export const FLAG_LABELS: Record<CoverageFlag, string> = {
  rvol: "RVOL",
  move: "Move",
  peer: "Peer",
  extended: "Ext",
  leader: "Lead",
  laggard: "Lag",
  earnings: "Earn",
  stale: "Stale",
};

export function ToneIcon({ value }: { value: number | null }) {
  const tone = marketTone(value);
  const Icon =
    tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : ArrowRight;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-3",
        tone === "positive"
          ? "text-[var(--market-positive)]"
          : tone === "negative"
            ? "text-[var(--market-negative)]"
            : "text-[var(--market-unchanged)]",
      )}
    />
  );
}

export function PercentText({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const tone = marketTone(value);
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        tone === "positive"
          ? "text-[var(--market-positive)]"
          : tone === "negative"
            ? "text-[var(--market-negative)]"
            : "text-[var(--ib-text-muted)]",
        className,
      )}
    >
      {formatSignedPercent(value)}
    </span>
  );
}

export function heatmapFill(change: number | null) {
  if (change == null || change === 0) return "bg-[var(--ib-surface-2)]";
  const intensity = Math.min(Math.abs(change) / 2.5, 1);
  if (change > 0) {
    return intensity > 0.66
      ? "bg-[color-mix(in_oklab,var(--market-positive)_34%,var(--ib-surface-2))]"
      : intensity > 0.33
        ? "bg-[color-mix(in_oklab,var(--market-positive)_20%,var(--ib-surface-2))]"
        : "bg-[color-mix(in_oklab,var(--market-positive)_10%,var(--ib-surface-2))]";
  }
  return intensity > 0.66
    ? "bg-[color-mix(in_oklab,var(--market-negative)_34%,var(--ib-surface-2))]"
    : intensity > 0.33
      ? "bg-[color-mix(in_oklab,var(--market-negative)_20%,var(--ib-surface-2))]"
      : "bg-[color-mix(in_oklab,var(--market-negative)_10%,var(--ib-surface-2))]";
}

export function FlagPills({ flags }: { flags: CoverageFlag[] }) {
  if (!flags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.slice(0, 3).map((flag) => (
        <Badge
          key={flag}
          tone={
            flag === "leader"
              ? "positive"
              : flag === "laggard" || flag === "move" || flag === "stale"
                ? "negative"
                : flag === "rvol" || flag === "extended" || flag === "earnings"
                  ? "warn"
                  : "info"
          }
        >
          {FLAG_LABELS[flag]}
        </Badge>
      ))}
    </span>
  );
}
