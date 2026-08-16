import type { MarketPulseDriver, MarketPulseDriverId } from "@/lib/market-data/market-pulse";
import { cn } from "@/lib/utils/cn";
import { marketToneClass } from "@/lib/utils/format";

function signedContribution(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export function SignalDrivers({ drivers, activeDriver, onActiveDriver, onSelectSymbol }: { drivers: MarketPulseDriver[]; activeDriver: MarketPulseDriverId | null; onActiveDriver: (driver: MarketPulseDriverId | null) => void; onSelectSymbol?: (ticker: string) => void }) {
  const available = drivers.filter((driver) => driver.normalizedValue != null);
  return (
    <div className="h-full rounded-[6px] border border-[var(--ib-border-subtle)] bg-[var(--ib-surface-inset)] p-3">
      <div className="flex items-end justify-between gap-3 border-b border-[var(--ib-border-subtle)] pb-2">
        <div><h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ib-text-primary)]">Signal Drivers</h3><p className="mt-0.5 text-[9px] text-[var(--ib-text-muted)]">Signal contribution · score points</p></div>
        <span className="font-mono text-[9px] text-[var(--ib-text-muted)]">{available.length}/{drivers.length}</span>
      </div>
      <ul className="mt-1 divide-y divide-[var(--ib-border-subtle)]">
        {drivers.map((driver) => {
          const value = driver.contribution;
          const positive = (value ?? 0) > 0;
          const active = activeDriver === driver.id;
          const width = value == null ? 0 : Math.min(Math.abs(value) / 8 * 50, 50);
          return (
            <li key={driver.id} className={cn("relative py-1.5 transition-colors", active && "bg-[var(--ib-surface-2)]")} onMouseEnter={() => onActiveDriver(driver.id)} onMouseLeave={() => onActiveDriver(null)} onFocus={() => onActiveDriver(driver.id)} onBlur={() => onActiveDriver(null)}>
              <button
                type="button"
                className="block w-full text-left"
                title={driver.explanation}
                onClick={() => {
                  const ticker = driver.quote?.ticker ?? driver.symbols[0];
                  if (ticker) onSelectSymbol?.(ticker);
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[10px] font-medium text-[var(--ib-text-secondary)]">
                    {driver.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] font-semibold",
                      value == null ? "text-[var(--ib-text-muted)]" : marketToneClass(value),
                    )}
                  >
                    {signedContribution(value)}
                  </span>
                </span>
                <span className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--ib-surface-2)]">
                  <span className="absolute left-1/2 top-0 h-full w-px bg-[var(--ib-border-control)]" />
                  {value != null && value !== 0 ? (
                    <span
                      className={cn(
                        "absolute top-0 h-full",
                        positive
                          ? "left-1/2 bg-[var(--market-positive)]"
                          : "right-1/2 bg-[var(--market-negative)]",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  ) : null}
                </span>
                <span className="mt-1 flex items-center justify-between gap-2 font-mono text-[8px] text-[var(--ib-text-muted)]">
                  <span className="truncate">{driver.metric}</span>
                  <span>{Math.round(driver.weight * 100)}% wt</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
