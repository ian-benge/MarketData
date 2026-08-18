import { describe, expect, it } from "vitest";
import { decideAlert } from "@/lib/scanner/alerts";
import type { PriorAlertState } from "@/lib/scanner/types";

const policy = {
  cooldownSeconds: 180,
  consolidateSeconds: 60,
  oncePerSession: false,
};

function prior(overrides: Partial<PriorAlertState> = {}): PriorAlertState {
  return {
    id: "a1",
    ticker: "ABCD",
    strategyId: "hod_momentum_small",
    sessionDate: "2026-08-17",
    firedAt: "2026-08-17T14:00:00.000Z",
    lastSeenAt: "2026-08-17T14:00:00.000Z",
    last: 8,
    occurrenceCount: 1,
    status: "active",
    ...overrides,
  };
}

describe("scanner alert cooldown", () => {
  it("fires the first time a ticker qualifies", () => {
    const decision = decideAlert({
      ticker: "ABCD",
      strategyId: "hod_momentum_small",
      sessionDate: "2026-08-17",
      now: new Date("2026-08-17T14:00:00.000Z"),
      last: 8,
      prior: null,
      policy,
    });
    expect(decision.action).toBe("fire");
  });

  it("consolidates repeats inside the short window instead of emitting a new tape row", () => {
    const decision = decideAlert({
      ticker: "ABCD",
      strategyId: "hod_momentum_small",
      sessionDate: "2026-08-17",
      now: new Date("2026-08-17T14:00:30.000Z"),
      last: 8.01,
      prior: prior(),
      policy,
    });
    expect(decision).toMatchObject({ action: "consolidate", priorId: "a1" });
  });

  it("suppresses after consolidation until cooldown elapses", () => {
    const decision = decideAlert({
      ticker: "ABCD",
      strategyId: "hod_momentum_small",
      sessionDate: "2026-08-17",
      now: new Date("2026-08-17T14:02:00.000Z"),
      last: 8.2,
      prior: prior({ lastSeenAt: "2026-08-17T14:00:30.000Z" }),
      policy,
    });
    expect(decision.action).toBe("suppress");
  });

  it("fires again only after cooldown", () => {
    const decision = decideAlert({
      ticker: "ABCD",
      strategyId: "hod_momentum_small",
      sessionDate: "2026-08-17",
      now: new Date("2026-08-17T14:04:00.000Z"),
      last: 8.6,
      prior: prior({ lastSeenAt: "2026-08-17T14:00:30.000Z" }),
      policy,
    });
    expect(decision.action).toBe("fire");
  });

  it("once-per-session strategies do not re-fire later in the day", () => {
    const decision = decideAlert({
      ticker: "ABCD",
      strategyId: "five_pillars",
      sessionDate: "2026-08-17",
      now: new Date("2026-08-17T18:00:00.000Z"),
      last: 9,
      prior: prior({ strategyId: "five_pillars", firedAt: "2026-08-17T13:40:00.000Z", lastSeenAt: "2026-08-17T13:40:00.000Z" }),
      policy: { ...policy, oncePerSession: true, consolidateSeconds: 120 },
    });
    expect(decision.action).toBe("suppress");
  });
});
