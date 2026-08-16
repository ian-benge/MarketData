/** Leftover lots below these floors do not define book risk or desk alerts. */
export const RESIDUAL_NOTIONAL = 50;
export const RESIDUAL_DAY_PNL = 5;
export const RESIDUAL_UNREALIZED = 25;

export function isResidualBookLot(position?: {
  marketValue?: number | null;
  dayPnl?: number | null;
  unrealizedPnl?: number | null;
  quantity?: number | null;
  multiplier?: number | null;
  entryPrice?: number | null;
} | null): boolean {
  if (!position) return false;
  if (position.marketValue != null && Math.abs(position.marketValue) < RESIDUAL_NOTIONAL) {
    return true;
  }
  if (position.marketValue == null) {
    const quantity = position.quantity ?? 0;
    const multiplier = position.multiplier ?? 1;
    const entry = position.entryPrice ?? 0;
    const implied = Math.abs(quantity * multiplier * entry);
    if (implied > 0 && implied < RESIDUAL_NOTIONAL) return true;
  }
  if (position.dayPnl == null && position.unrealizedPnl == null) return false;
  return (
    Math.abs(position.dayPnl ?? 0) < RESIDUAL_DAY_PNL &&
    Math.abs(position.unrealizedPnl ?? 0) < RESIDUAL_UNREALIZED
  );
}
