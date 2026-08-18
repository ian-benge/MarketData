import type { AlertDecision, PriorAlertState } from "./types";

export type AlertPolicy = {
  cooldownSeconds: number;
  consolidateSeconds: number;
  oncePerSession: boolean;
  minPriceMovePct?: number;
};

export function decideAlert(input: {
  ticker: string;
  strategyId: string;
  sessionDate: string;
  now: Date;
  last: number | null;
  prior: PriorAlertState | null;
  policy: AlertPolicy;
}): AlertDecision {
  const { prior, policy, now, sessionDate, last } = input;
  if (!prior) {
    return { action: "fire", reason: "first qualifying print for this strategy" };
  }

  if (policy.oncePerSession && prior.sessionDate === sessionDate) {
    const sinceLast = now.getTime() - Date.parse(prior.lastSeenAt);
    if (Number.isFinite(sinceLast) && sinceLast <= policy.consolidateSeconds * 1000) {
      return {
        action: "consolidate",
        reason: "same-session repeat within consolidation window",
        priorId: prior.id,
      };
    }
    return {
      action: "suppress",
      reason: "strategy fires at most once per session",
    };
  }

  const lastSeen = Date.parse(prior.lastSeenAt);
  const fired = Date.parse(prior.firedAt);
  if (!Number.isFinite(lastSeen) || !Number.isFinite(fired)) {
    return { action: "fire", reason: "prior alert timestamps unusable" };
  }

  const sinceLastSeen = now.getTime() - lastSeen;
  const sinceFired = now.getTime() - fired;

  if (sinceLastSeen <= policy.consolidateSeconds * 1000) {
    const movedEnough = priceMovedEnough(prior.last, last, policy.minPriceMovePct ?? 0.35);
    if (!movedEnough) {
      return {
        action: "consolidate",
        reason: "repeat print within consolidation window without a meaningful new move",
        priorId: prior.id,
      };
    }
  }

  if (sinceFired < policy.cooldownSeconds * 1000) {
    if (sinceLastSeen <= policy.consolidateSeconds * 1000) {
      return {
        action: "consolidate",
        reason: "cooldown active; folding into the open alert",
        priorId: prior.id,
      };
    }
    return {
      action: "suppress",
      reason: `cooldown ${policy.cooldownSeconds}s has not elapsed`,
    };
  }

  return { action: "fire", reason: "cooldown elapsed; new distinct event" };
}

function priceMovedEnough(
  previous: number | null,
  current: number | null,
  minPct: number,
): boolean {
  if (previous == null || current == null) return false;
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) {
    return false;
  }
  return (Math.abs(current - previous) / Math.abs(previous)) * 100 >= minPct;
}

export function mergeConsolidatedPayload<T extends { occurrenceCount: number; lastSeenAt: string }>(
  previous: T,
  next: Omit<T, "occurrenceCount">,
): T {
  return {
    ...previous,
    ...next,
    occurrenceCount: previous.occurrenceCount + 1,
    lastSeenAt: next.lastSeenAt,
  } as T;
}
