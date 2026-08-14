"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useHideValues } from "@/components/positions/privacy-context";
import { cn } from "@/lib/utils/cn";
import {
  formatCurrency,
  formatPrice,
  formatSignedCurrency,
  formatSignedPercent,
  marketTone,
} from "@/lib/utils/format";
import { displayPositionTicker, parseOccOptionSymbol } from "@/lib/positions/option-symbol";
import type { PositionAssetType, PositionSide } from "@/lib/positions/types";

export const ASSET_TYPE_LABELS: Record<PositionAssetType, string> = {
  equity: "Equity",
  etf: "ETF",
  option: "Option",
  future: "Future",
  crypto: "Crypto",
  other: "Other",
};

export function chicagoDateInput(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatEntryDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function toneClass(value: number | null | undefined): string {
  const tone = marketTone(value);
  if (tone === "positive") return "text-[var(--market-positive)]";
  if (tone === "negative") return "text-[var(--market-negative)]";
  return "text-[var(--market-unchanged)]";
}

export function ToneIcon({ value }: { value: number | null | undefined }) {
  const tone = marketTone(value);
  const Icon =
    tone === "positive"
      ? ArrowUpRight
      : tone === "negative"
        ? ArrowDownRight
        : ArrowRight;
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-3", toneClass(value))}
    />
  );
}

export function HiddenValue({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums tracking-[0.12em] text-[var(--ib-text-muted)]",
        className,
      )}
      aria-label="Hidden"
    >
      ••••
    </span>
  );
}

export function PriceValue({
  value,
  ticker,
  className,
}: {
  value: number | null | undefined;
  ticker?: string;
  className?: string;
}) {
  const hide = useHideValues();
  if (hide) return <HiddenValue className={className} />;
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatPrice(value, ticker)}
    </span>
  );
}

export function TickerLabel({ ticker }: { ticker: string }) {
  const parsed = parseOccOptionSymbol(ticker);
  return (
    <span
      className="block font-mono text-[13px] font-medium text-[var(--ib-text-primary)]"
      title={parsed ? parsed.raw : ticker}
    >
      {displayPositionTicker(ticker)}
    </span>
  );
}

export function MoneyValue({
  value,
  compact = false,
  className,
}: {
  value: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const hide = useHideValues();
  if (hide) return <HiddenValue className={className} />;
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatCurrency(value, { compact })}
    </span>
  );
}

export function ShareValue({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const hide = useHideValues();
  if (hide) return <HiddenValue className={className} />;
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`}
    </span>
  );
}

export function SignedValue({
  value,
  kind = "currency",
  compact = false,
  className,
}: {
  value: number | null | undefined;
  kind?: "currency" | "percent";
  compact?: boolean;
  className?: string;
}) {
  const hide = useHideValues();
  if (hide) return <HiddenValue className={className} />;
  const label =
    kind === "percent"
      ? formatSignedPercent(value)
      : formatSignedCurrency(value, { compact });
  return (
    <span className={cn("font-mono tabular-nums", toneClass(value), className)}>
      {label}
    </span>
  );
}

export function SideLabel({ side }: { side: PositionSide }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.07em]",
        side === "long"
          ? "border-[color-mix(in_oklab,var(--market-positive)_38%,transparent)] text-[var(--market-positive)]"
          : "border-[color-mix(in_oklab,var(--market-negative)_38%,transparent)] text-[var(--market-negative)]",
      )}
    >
      {side === "long" ? "Long" : "Short"}
    </span>
  );
}

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const hide = useHideValues();
  if (hide) {
    return (
      <span
        className="inline-block h-[22px] w-[72px] rounded-[2px] bg-[var(--ib-surface-inset)]"
        aria-label="Hidden"
      />
    );
  }
  if (values.length < 2) {
    return (
      <span className="font-mono text-[11px] text-[var(--ib-text-muted)]">—</span>
    );
  }
  const width = 72;
  const height = 22;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values.at(-1) ?? 0;
  const tone = marketTone(last);
  const stroke =
    tone === "positive"
      ? "var(--market-positive)"
      : tone === "negative"
        ? "var(--market-negative)"
        : "var(--market-unchanged)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={label}
      className="block"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        points={points}
      />
    </svg>
  );
}
