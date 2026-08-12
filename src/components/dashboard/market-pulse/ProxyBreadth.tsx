import type { MarketPulseResult } from "@/lib/market-data/market-pulse";
import type { NormalizedQuote } from "@/lib/providers/types";
import { cn } from "@/lib/utils/cn";
import { formatSignedPercent } from "@/lib/utils/format";

export function ProxyBreadth({ quotes, result, breadthSupported, breadthExplanation }: { quotes: NormalizedQuote[]; result: MarketPulseResult; breadthSupported?: boolean; breadthExplanation?: string | null }) {
  const ranked = quotes.filter((quote) => quote.changePercent != null).sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  const leaders = ranked.filter((quote) => (quote.changePercent ?? 0) > 0).slice(0, 3);
  const laggards = [...ranked].reverse().filter((quote) => (quote.changePercent ?? 0) < 0).slice(0, 3);
  const direction = result.positiveCount === result.negativeCount ? "Participation is balanced across the configured proxy basket." : result.positiveCount > result.negativeCount ? `${result.positiveCount} of ${result.comparableCount} configured proxies are positive; leadership is ${result.positiveCount / Math.max(result.comparableCount, 1) >= 0.7 ? "broad" : "selective"}.` : `${result.negativeCount} of ${result.comparableCount} configured proxies are negative; participation is defensive.`;
  return (
    <div className="mt-3 rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] p-3">
      <div className="grid gap-4 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">Configured proxy breadth</p><p className="mt-1 font-mono text-[12px] text-[var(--ib-text-primary)]">{result.positiveCount} / {result.comparableCount} proxies positive</p></div><span className="font-mono text-[9px] text-[var(--ib-text-muted)]">Not consolidated breadth</span></div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--ib-surface-2)]" aria-label={`${result.positiveCount} positive, ${result.negativeCount} negative, ${result.neutralCount} neutral or unavailable`}><span className="bg-[var(--market-positive)]" style={{ width: `${result.comparableCount ? result.positiveCount / result.comparableCount * 100 : 0}%` }} /><span className="bg-[var(--market-unchanged)]" style={{ width: `${result.comparableCount ? result.neutralCount / result.comparableCount * 100 : 100}%` }} /><span className="bg-[var(--market-negative)]" style={{ width: `${result.comparableCount ? result.negativeCount / result.comparableCount * 100 : 0}%` }} /></div>
          {breadthSupported === false ? <p className="mt-2 text-[9px] leading-4 text-[var(--state-warning)]">{breadthExplanation ?? "Consolidated market breadth is unavailable for this feed."}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-4"><TickerList label="Leadership" quotes={leaders} positive /><TickerList label="Laggards" quotes={laggards} /></div>
        <p className="text-[10px] leading-4 text-[var(--ib-text-secondary)] lg:col-span-3">{direction}</p>
      </div>
      <details className="mt-3 border-t border-[var(--ib-border-subtle)] pt-2">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ib-text-muted)] hover:text-[var(--ib-text-primary)]">
          All proxies by rank · {ranked.length}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto terminal-scroll">
          <div className="flex flex-wrap gap-1">
            {ranked.length ? ranked.map((quote) => {
              const change = quote.changePercent ?? 0;
              return (
                <span key={quote.ticker} className="rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-1.5 py-1 font-mono text-[9px]">
                  <span className="text-[var(--ib-text-primary)]">{quote.ticker}</span>{" "}
                  <span className={cn(change > 0 ? "text-[var(--market-positive)]" : change < 0 ? "text-[var(--market-negative)]" : "text-[var(--market-unchanged)]")}>{formatSignedPercent(quote.changePercent)}</span>
                </span>
              );
            }) : <span className="text-[9px] text-[var(--ib-text-muted)]">None</span>}
          </div>
        </div>
      </details>
    </div>
  );
}

function TickerList({ label, quotes, positive = false }: { label: string; quotes: NormalizedQuote[]; positive?: boolean }) {
  return <div><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--ib-text-muted)]">{label}</p><div className="mt-1.5 flex flex-wrap gap-1">{quotes.length ? quotes.map((quote) => <span key={quote.ticker} className="rounded-[3px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-2)] px-1.5 py-1 font-mono text-[9px]"><span className="text-[var(--ib-text-primary)]">{quote.ticker}</span> <span className={cn(positive ? "text-[var(--market-positive)]" : "text-[var(--market-negative)]")}>{formatSignedPercent(quote.changePercent)}</span></span>) : <span className="text-[9px] text-[var(--ib-text-muted)]">None</span>}</div></div>;
}
