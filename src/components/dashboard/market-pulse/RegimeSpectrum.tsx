import { PulseHistoryChart } from "@/components/dashboard/market-pulse/PulseHistoryChart";
import type { MarketPulseResult } from "@/lib/market-data/market-pulse";
import { cn } from "@/lib/utils/cn";

const LABELS = ["Risk-Off", "Defensive", "Mixed", "Constructive", "Risk-On"];

export function RegimeSpectrum({ result }: { result: MarketPulseResult }) {
  const score = result.score;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-[7px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] px-3 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-4">
      <PulseHistoryChart liveScore={score} liveAt={result.calculatedAt} />
      <div className="relative pt-7" aria-label={score == null ? "Market Pulse score unavailable" : `Market Pulse score ${score} out of 100, ${result.regime}`}>
        <div className="grid h-2 grid-cols-5 overflow-hidden rounded-full border border-[var(--ib-border-strong)]">
          {LABELS.map((label, index) => <span key={label} className={cn("border-r border-[var(--ib-border-strong)] last:border-r-0", index === 2 ? "bg-[var(--ib-surface-3)]" : index < 2 ? "bg-[color-mix(in_oklab,var(--ib-surface-2)_78%,#5f3034)]" : "bg-[color-mix(in_oklab,var(--ib-surface-2)_78%,#40524c)]")} />)}
        </div>
        {score != null ? (
          <div className="absolute top-0 -translate-x-1/2" style={{ left: `${score}%` }}>
            <span className="block rounded-[3px] border border-[var(--ib-maroon-500)] bg-[var(--ib-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ib-text-primary)] shadow-[0_0_14px_color-mix(in_oklab,var(--ib-maroon-500)_28%,transparent)]">{score}</span>
            <span className="mx-auto block h-5 w-px bg-[var(--ib-maroon-300)]" />
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-5 gap-1">
          {LABELS.map((label) => <span key={label} className="text-center font-mono text-[8px] leading-3 text-[var(--ib-text-muted)] sm:text-[9px]">{label}</span>)}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[var(--ib-border-subtle)] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)]">
        <span>0</span><span>{score == null ? "Score withheld" : `Pulse score ${score} / 100`}</span><span>100</span>
      </div>
    </div>
  );
}
