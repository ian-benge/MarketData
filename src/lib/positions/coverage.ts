import type {
  EnrichedPosition,
  PositionRecord,
  PositionsSnapshot,
} from "./types";

export function marketSymbolsForPositions(
  positions: Array<Pick<PositionRecord, "ticker" | "status">>,
): string[] {
  const unique = new Set<string>();
  for (const row of positions) {
    if (row.status !== "open") continue;
    const ticker = row.ticker.trim().toUpperCase();
    if (ticker) unique.add(ticker);
  }
  return [...unique];
}

export function positionsCoverageCopy(
  snapshot: Pick<
    PositionsSnapshot,
    | "quotesRequested"
    | "quotesCovered"
    | "latencyCoverageLabel"
    | "usingFixtures"
    | "summary"
    | "ownerLocked"
  >,
): { label: string; detail: string } {
  const requested = snapshot.quotesRequested;
  const covered = snapshot.quotesCovered;
  const openCount = snapshot.summary.openCount;
  const flat = requested === 0 || openCount === 0;

  if (flat) {
    return {
      label: snapshot.ownerLocked
        ? "No open lots to mark"
        : "Flat · no live marks required",
      detail: "",
    };
  }

  const detail = `${covered}/${requested} open marked`;
  if (snapshot.usingFixtures) {
    return { label: snapshot.latencyCoverageLabel || "Mock data", detail };
  }
  if (covered === 0) {
    return { label: "No live marks", detail };
  }
  if (covered < requested) {
    return { label: `Partial · ${covered}/${requested} open`, detail };
  }
  return {
    label: snapshot.latencyCoverageLabel || "Live marks",
    detail,
  };
}

export function mergePolledSnapshot(
  previous: PositionsSnapshot,
  polled: PositionsSnapshot,
): PositionsSnapshot {
  if (polled.ownerLocked) return polled;
  const sameBook =
    polled.bookId === previous.bookId && polled.ownerId === previous.ownerId;
  if (!sameBook || polled.closedIncluded !== false) return polled;
  const closed = previous.positions.filter((row) => row.status === "closed");
  const open = polled.positions.filter((row) => row.status === "open");
  return {
    ...polled,
    positions: [...open, ...closed],
    history: Object.keys(polled.history).length ? polled.history : previous.history,
  };
}

export function closedRowsFromSnapshot(
  snapshot: PositionsSnapshot,
): EnrichedPosition[] {
  return snapshot.positions.filter((row) => row.status === "closed");
}
