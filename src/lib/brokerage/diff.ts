import type { NormalizedHolding, SyncedPositionRow } from "./types";

export function planSyncedBookChanges(
  existing: SyncedPositionRow[],
  holdings: NormalizedHolding[],
  manualKeys: Set<string>,
): {
  upserts: NormalizedHolding[];
  closes: SyncedPositionRow[];
  skipped: NormalizedHolding[];
} {
  const upserts: NormalizedHolding[] = [];
  const skipped: NormalizedHolding[] = [];
  const seen = new Set<string>();
  for (const holding of holdings) {
    if (manualKeys.has(`${holding.ticker}:${holding.side}`)) {
      skipped.push(holding);
      continue;
    }
    seen.add(holding.externalId);
    upserts.push(holding);
  }
  const closes = existing.filter(
    (lot) => lot.externalId && !seen.has(lot.externalId),
  );
  return { upserts, closes, skipped };
}
