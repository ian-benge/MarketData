import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryUsageStore,
  resetUsageStore,
} from "@/lib/market-data/usage";

describe("usage / quota / circuit breaker", () => {
  beforeEach(() => {
    resetUsageStore();
  });

  it("tracks minute/hour/day counters and warns at 70/85/95%", () => {
    const store = new InMemoryUsageStore({
      limitsByProvider: {
        alpaca: {
          requestsPerMinute: 100,
          requestsPerHour: 1000,
          requestsPerDay: 10_000,
        },
      },
    });
    const at = new Date("2026-08-10T15:00:00.000Z");
    store.record({ providerKey: "alpaca", requests: 70, at });
    let snap = store.getSnapshot("alpaca", at);
    expect(snap.warnings.some((w) => w.level === 70)).toBe(true);

    store.record({ providerKey: "alpaca", requests: 15, at });
    snap = store.getSnapshot("alpaca", at);
    expect(snap.warnings.some((w) => w.level === 85)).toBe(true);

    store.record({ providerKey: "alpaca", requests: 10, at });
    snap = store.getSnapshot("alpaca", at);
    expect(snap.warnings.some((w) => w.level === 95)).toBe(true);
    expect(snap.windows.minute.requests).toBe(95);
  });

  it("opens circuit on hard limit and exposes backoff", () => {
    const store = new InMemoryUsageStore({
      limitsByProvider: {
        alpaca: {
          requestsPerMinute: 5,
          requestsPerHour: 100,
          requestsPerDay: 1000,
        },
      },
      baseCooldownMs: 10_000,
    });
    const at = new Date("2026-08-10T15:00:00.000Z");
    store.record({ providerKey: "alpaca", requests: 5, at });
    expect(store.isCircuitOpen("alpaca", at)).toBe(true);
    expect(store.backoffMs("alpaca", at)).toBeGreaterThan(0);
  });

  it("opens circuit after consecutive failures", () => {
    const store = new InMemoryUsageStore({
      failureThreshold: 3,
      baseCooldownMs: 5_000,
    });
    const at = new Date("2026-08-10T15:00:00.000Z");
    store.record({ providerKey: "alpaca", error: true, at });
    store.record({ providerKey: "alpaca", error: true, at });
    expect(store.isCircuitOpen("alpaca", at)).toBe(false);
    store.record({ providerKey: "alpaca", error: true, at });
    expect(store.isCircuitOpen("alpaca", at)).toBe(true);
  });
});
