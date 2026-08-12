/**
 * In-memory usage / quota / circuit-breaker for market-data providers.
 * Implements UsageStore so a DB-backed store can replace it later.
 */

export type UsageWindowKind = "minute" | "hour" | "day";

export type UsageLimits = {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  symbolsPerMinute?: number;
  recordsPerMinute?: number;
};

export type UsageCounters = {
  requests: number;
  symbols: number;
  records: number;
  errors: number;
};

export type UsageSnapshot = {
  providerKey: string;
  asOf: string;
  windows: Record<UsageWindowKind, UsageCounters & { windowStart: string }>;
  limits: UsageLimits;
  utilization: {
    minuteRequests: number;
    hourRequests: number;
    dayRequests: number;
  };
  warnings: UsageWarning[];
  circuit: CircuitState;
};

export type UsageWarningLevel = 70 | 85 | 95;

export type UsageWarning = {
  level: UsageWarningLevel;
  window: UsageWindowKind;
  metric: "requests" | "symbols" | "records";
  used: number;
  limit: number;
  message: string;
};

export type CircuitState = {
  open: boolean;
  openedAt: string | null;
  cooldownUntil: string | null;
  consecutiveFailures: number;
  reason: string | null;
};

export type RecordUsageInput = {
  providerKey: string;
  requests?: number;
  symbols?: number;
  records?: number;
  error?: boolean;
  at?: Date;
};

export interface UsageStore {
  record(input: RecordUsageInput): UsageSnapshot;
  getSnapshot(providerKey: string, at?: Date): UsageSnapshot;
  listSnapshots(at?: Date): UsageSnapshot[];
  reset(providerKey?: string): void;
  /** True when circuit is open (caller should back off). */
  isCircuitOpen(providerKey: string, at?: Date): boolean;
  /** Remaining backoff ms before next attempt; 0 if closed. */
  backoffMs(providerKey: string, at?: Date): number;
}

const WARNING_LEVELS: UsageWarningLevel[] = [70, 85, 95];

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
  requestsPerMinute: 200,
  requestsPerHour: 5_000,
  requestsPerDay: 200_000,
  symbolsPerMinute: 2_000,
  recordsPerMinute: 10_000,
};

export const PROVIDER_DEFAULT_LIMITS: Record<string, UsageLimits> = {
  alpaca: {
    requestsPerMinute: 200,
    requestsPerHour: 5_000,
    requestsPerDay: 200_000,
    symbolsPerMinute: 2_000,
    recordsPerMinute: 10_000,
  },
  massive: {
    requestsPerMinute: 60,
    requestsPerHour: 1_500,
    requestsPerDay: 100_000,
    symbolsPerMinute: 500,
    recordsPerMinute: 5_000,
  },
  finnhub: {
    requestsPerMinute: 30,
    requestsPerHour: 600,
    requestsPerDay: 60_000,
    symbolsPerMinute: 200,
    recordsPerMinute: 2_000,
  },
};

type WindowBucket = UsageCounters & { windowStartMs: number };

type ProviderState = {
  minute: WindowBucket;
  hour: WindowBucket;
  day: WindowBucket;
  limits: UsageLimits;
  circuit: {
    open: boolean;
    openedAtMs: number | null;
    cooldownUntilMs: number | null;
    consecutiveFailures: number;
    reason: string | null;
  };
  /** Levels already emitted this window (avoid spam). */
  warnedMinute: Set<UsageWarningLevel>;
  warnedHour: Set<UsageWarningLevel>;
  warnedDay: Set<UsageWarningLevel>;
};

function emptyBucket(windowStartMs: number): WindowBucket {
  return {
    windowStartMs,
    requests: 0,
    symbols: 0,
    records: 0,
    errors: 0,
  };
}

function floorWindow(atMs: number, kind: UsageWindowKind): number {
  if (kind === "minute") return Math.floor(atMs / 60_000) * 60_000;
  if (kind === "hour") return Math.floor(atMs / 3_600_000) * 3_600_000;
  // day UTC
  const d = new Date(atMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function limitFor(
  limits: UsageLimits,
  window: UsageWindowKind,
  metric: "requests" | "symbols" | "records",
): number | null {
  if (metric === "requests") {
    if (window === "minute") return limits.requestsPerMinute;
    if (window === "hour") return limits.requestsPerHour;
    return limits.requestsPerDay;
  }
  if (window !== "minute") return null;
  if (metric === "symbols") return limits.symbolsPerMinute ?? null;
  return limits.recordsPerMinute ?? null;
}

export type InMemoryUsageStoreOptions = {
  limitsByProvider?: Record<string, UsageLimits>;
  defaultLimits?: UsageLimits;
  /** Failures before opening circuit. */
  failureThreshold?: number;
  /** Base cooldown when circuit opens (ms). */
  baseCooldownMs?: number;
  /** Max cooldown (ms). */
  maxCooldownMs?: number;
};

/**
 * Process-local usage store with rolling minute/hour/day windows,
 * soft warnings at 70/85/95%, and a simple circuit breaker.
 */
export class InMemoryUsageStore implements UsageStore {
  private readonly states = new Map<string, ProviderState>();
  private readonly limitsByProvider: Record<string, UsageLimits>;
  private readonly defaultLimits: UsageLimits;
  private readonly failureThreshold: number;
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;

  constructor(options: InMemoryUsageStoreOptions = {}) {
    this.limitsByProvider = {
      ...PROVIDER_DEFAULT_LIMITS,
      ...options.limitsByProvider,
    };
    this.defaultLimits = options.defaultLimits ?? DEFAULT_USAGE_LIMITS;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.baseCooldownMs = options.baseCooldownMs ?? 5_000;
    this.maxCooldownMs = options.maxCooldownMs ?? 120_000;
  }

  private ensure(providerKey: string, atMs: number): ProviderState {
    let state = this.states.get(providerKey);
    if (!state) {
      state = {
        minute: emptyBucket(floorWindow(atMs, "minute")),
        hour: emptyBucket(floorWindow(atMs, "hour")),
        day: emptyBucket(floorWindow(atMs, "day")),
        limits: this.limitsByProvider[providerKey] ?? this.defaultLimits,
        circuit: {
          open: false,
          openedAtMs: null,
          cooldownUntilMs: null,
          consecutiveFailures: 0,
          reason: null,
        },
        warnedMinute: new Set(),
        warnedHour: new Set(),
        warnedDay: new Set(),
      };
      this.states.set(providerKey, state);
    }
    this.rollWindows(state, atMs);
    this.maybeCloseCircuit(state, atMs);
    return state;
  }

  private rollWindows(state: ProviderState, atMs: number): void {
    const m = floorWindow(atMs, "minute");
    const h = floorWindow(atMs, "hour");
    const d = floorWindow(atMs, "day");
    if (state.minute.windowStartMs !== m) {
      state.minute = emptyBucket(m);
      state.warnedMinute.clear();
    }
    if (state.hour.windowStartMs !== h) {
      state.hour = emptyBucket(h);
      state.warnedHour.clear();
    }
    if (state.day.windowStartMs !== d) {
      state.day = emptyBucket(d);
      state.warnedDay.clear();
    }
  }

  private maybeCloseCircuit(state: ProviderState, atMs: number): void {
    if (
      state.circuit.open &&
      state.circuit.cooldownUntilMs != null &&
      atMs >= state.circuit.cooldownUntilMs
    ) {
      state.circuit.open = false;
      state.circuit.openedAtMs = null;
      state.circuit.cooldownUntilMs = null;
      state.circuit.reason = null;
    }
  }

  private openCircuit(state: ProviderState, atMs: number, reason: string): void {
    const failures = Math.max(1, state.circuit.consecutiveFailures);
    const cooldown = Math.min(
      this.maxCooldownMs,
      this.baseCooldownMs * 2 ** Math.min(failures - 1, 5),
    );
    state.circuit.open = true;
    state.circuit.openedAtMs = atMs;
    state.circuit.cooldownUntilMs = atMs + cooldown;
    state.circuit.reason = reason;
  }

  private collectWarnings(state: ProviderState): UsageWarning[] {
    const warnings: UsageWarning[] = [];
    const windows: Array<{
      kind: UsageWindowKind;
      bucket: WindowBucket;
      warned: Set<UsageWarningLevel>;
    }> = [
      { kind: "minute", bucket: state.minute, warned: state.warnedMinute },
      { kind: "hour", bucket: state.hour, warned: state.warnedHour },
      { kind: "day", bucket: state.day, warned: state.warnedDay },
    ];

    for (const { kind, bucket, warned } of windows) {
      for (const metric of ["requests", "symbols", "records"] as const) {
        const limit = limitFor(state.limits, kind, metric);
        if (limit == null || limit <= 0) continue;
        const used = bucket[metric];
        const pct = (used / limit) * 100;
        for (const level of WARNING_LEVELS) {
          if (pct >= level && !warned.has(level)) {
            warned.add(level);
            warnings.push({
              level,
              window: kind,
              metric,
              used,
              limit,
              message: `${metric} at ${level}% of ${kind} limit (${used}/${limit})`,
            });
          } else if (pct >= level && warned.has(level)) {
            // Re-surface previously crossed levels on snapshot
            warnings.push({
              level,
              window: kind,
              metric,
              used,
              limit,
              message: `${metric} at ${level}% of ${kind} limit (${used}/${limit})`,
            });
          }
        }
      }
    }

    // Dedupe by level+window+metric
    const seen = new Set<string>();
    return warnings.filter((w) => {
      const key = `${w.window}:${w.metric}:${w.level}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private toSnapshot(providerKey: string, state: ProviderState, at: Date): UsageSnapshot {
    const util = (used: number, limit: number) =>
      limit > 0 ? used / limit : 0;
    return {
      providerKey,
      asOf: at.toISOString(),
      windows: {
        minute: {
          requests: state.minute.requests,
          symbols: state.minute.symbols,
          records: state.minute.records,
          errors: state.minute.errors,
          windowStart: new Date(state.minute.windowStartMs).toISOString(),
        },
        hour: {
          requests: state.hour.requests,
          symbols: state.hour.symbols,
          records: state.hour.records,
          errors: state.hour.errors,
          windowStart: new Date(state.hour.windowStartMs).toISOString(),
        },
        day: {
          requests: state.day.requests,
          symbols: state.day.symbols,
          records: state.day.records,
          errors: state.day.errors,
          windowStart: new Date(state.day.windowStartMs).toISOString(),
        },
      },
      limits: { ...state.limits },
      utilization: {
        minuteRequests: util(state.minute.requests, state.limits.requestsPerMinute),
        hourRequests: util(state.hour.requests, state.limits.requestsPerHour),
        dayRequests: util(state.day.requests, state.limits.requestsPerDay),
      },
      warnings: this.collectWarnings(state),
      circuit: {
        open: state.circuit.open,
        openedAt:
          state.circuit.openedAtMs != null
            ? new Date(state.circuit.openedAtMs).toISOString()
            : null,
        cooldownUntil:
          state.circuit.cooldownUntilMs != null
            ? new Date(state.circuit.cooldownUntilMs).toISOString()
            : null,
        consecutiveFailures: state.circuit.consecutiveFailures,
        reason: state.circuit.reason,
      },
    };
  }

  private overHardLimit(state: ProviderState): string | null {
    if (state.minute.requests >= state.limits.requestsPerMinute) {
      return "requestsPerMinute exceeded";
    }
    if (state.hour.requests >= state.limits.requestsPerHour) {
      return "requestsPerHour exceeded";
    }
    if (state.day.requests >= state.limits.requestsPerDay) {
      return "requestsPerDay exceeded";
    }
    if (
      state.limits.symbolsPerMinute != null &&
      state.minute.symbols >= state.limits.symbolsPerMinute
    ) {
      return "symbolsPerMinute exceeded";
    }
    if (
      state.limits.recordsPerMinute != null &&
      state.minute.records >= state.limits.recordsPerMinute
    ) {
      return "recordsPerMinute exceeded";
    }
    return null;
  }

  record(input: RecordUsageInput): UsageSnapshot {
    const at = input.at ?? new Date();
    const atMs = at.getTime();
    const state = this.ensure(input.providerKey, atMs);

    const requests = input.requests ?? (input.error ? 0 : 1);
    const symbols = input.symbols ?? 0;
    const records = input.records ?? 0;

    for (const bucket of [state.minute, state.hour, state.day]) {
      bucket.requests += requests;
      bucket.symbols += symbols;
      bucket.records += records;
      if (input.error) bucket.errors += 1;
    }

    if (input.error) {
      state.circuit.consecutiveFailures += 1;
      if (state.circuit.consecutiveFailures >= this.failureThreshold) {
        this.openCircuit(
          state,
          atMs,
          `consecutive failures ≥ ${this.failureThreshold}`,
        );
      }
    } else if (requests > 0) {
      state.circuit.consecutiveFailures = 0;
    }

    const hard = this.overHardLimit(state);
    if (hard) {
      this.openCircuit(state, atMs, hard);
    }

    return this.toSnapshot(input.providerKey, state, at);
  }

  getSnapshot(providerKey: string, at: Date = new Date()): UsageSnapshot {
    const state = this.ensure(providerKey, at.getTime());
    return this.toSnapshot(providerKey, state, at);
  }

  listSnapshots(at: Date = new Date()): UsageSnapshot[] {
    const keys = new Set([
      ...this.states.keys(),
      ...Object.keys(this.limitsByProvider),
    ]);
    return [...keys].map((k) => this.getSnapshot(k, at));
  }

  reset(providerKey?: string): void {
    if (providerKey) this.states.delete(providerKey);
    else this.states.clear();
  }

  isCircuitOpen(providerKey: string, at: Date = new Date()): boolean {
    const state = this.ensure(providerKey, at.getTime());
    return state.circuit.open;
  }

  backoffMs(providerKey: string, at: Date = new Date()): number {
    const state = this.ensure(providerKey, at.getTime());
    if (!state.circuit.open || state.circuit.cooldownUntilMs == null) return 0;
    return Math.max(0, state.circuit.cooldownUntilMs - at.getTime());
  }
}

/** Process singleton for refresh / admin status. */
let globalUsageStore: InMemoryUsageStore | null = null;

export function getUsageStore(): InMemoryUsageStore {
  if (!globalUsageStore) globalUsageStore = new InMemoryUsageStore();
  return globalUsageStore;
}

/** Test helper */
export function resetUsageStore(): void {
  globalUsageStore = null;
}
