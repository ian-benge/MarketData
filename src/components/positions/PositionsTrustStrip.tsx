"use client";

import { Badge } from "@/components/ui/Badge";
import { ClientMarketTime } from "@/components/ui/ClientMarketTime";
import {
  StatusIndicator,
  type StatusKind,
} from "@/components/ui/StatusIndicator";
import { positionsCoverageCopy } from "@/lib/positions/coverage";
import type { PositionsSnapshot } from "@/lib/positions/types";

function coverageKind(
  snapshot: PositionsSnapshot,
): StatusKind {
  if (snapshot.usingFixtures) return "mock";
  if (snapshot.stale) return "stale";
  if (snapshot.summary.openCount === 0 || snapshot.quotesRequested === 0) {
    return "neutral";
  }
  if (snapshot.quotesCovered === 0) return "unavailable";
  if (snapshot.quotesCovered < snapshot.quotesRequested) return "partial";
  if (snapshot.latencyClass === "realtime") return "realtime";
  if (snapshot.latencyClass.includes("delayed")) return "delayed";
  if (snapshot.latencyClass === "eod") return "neutral";
  return "healthy";
}

export function PositionsTrustStrip({
  snapshot,
  pollError,
  lastSyncAt,
  viewingName,
}: {
  snapshot: PositionsSnapshot;
  pollError?: string | null;
  lastSyncAt?: string | null;
  viewingName?: string | null;
}) {
  const coverage = positionsCoverageCopy(snapshot);
  return (
    <div
      role="status"
      aria-label="Position data trust"
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--ib-text-muted)]"
    >
      <StatusIndicator kind={coverageKind(snapshot)} label={coverage.label} />
      {coverage.detail ? (
        <span className="font-mono tabular-nums">{coverage.detail}</span>
      ) : null}
      {snapshot.marketSession ? (
        <span className="capitalize">{snapshot.marketSession} session</span>
      ) : null}
      <span className="font-mono">
        as of <ClientMarketTime value={snapshot.asOf} seconds />
      </span>
      {lastSyncAt ? (
        <span className="font-mono">
          broker <ClientMarketTime value={lastSyncAt} />
        </span>
      ) : null}
      {snapshot.licenseWarning ? (
        <Badge tone="warn" title={snapshot.licenseWarning}>
          License
        </Badge>
      ) : null}
      {viewingName ? <span>Viewing {viewingName}</span> : null}
      {pollError ? (
        <span
          role="alert"
          className="text-[var(--state-warning)]"
        >
          {pollError}
        </span>
      ) : null}
    </div>
  );
}
