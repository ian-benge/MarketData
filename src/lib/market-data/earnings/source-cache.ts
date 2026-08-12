import { sanitizeEarningsError } from "@/lib/market-data/earnings/diagnostics";

function sanitizeSourceError(message: string): string {
  return sanitizeEarningsError(message);
}

/**
 * Last-known-good source cache.
 *
 * Lives in process memory. On Vercel/serverless this resets on cold start —
 * there is no durable earnings store in the app, and this change does not add
 * paid cache infrastructure. A failed refresh must keep the previous snapshot
 * and mark it stale instead of replacing it with an empty array.
 */

export type SourceCacheSnapshot<T> = {
  configured: boolean;
  ok: boolean;
  stale: boolean;
  fetchedAt: string | null;
  error: string | null;
  eventCount: number;
  data: T;
};

export class LastGoodCache<T> {
  private snapshot: SourceCacheSnapshot<T> | null = null;
  private freshUntil = 0;
  private inflight: Promise<SourceCacheSnapshot<T>> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly count: (data: T) => number,
    private readonly empty: () => T,
  ) {}

  peek(): SourceCacheSnapshot<T> | null {
    return this.snapshot;
  }

  reset() {
    this.snapshot = null;
    this.freshUntil = 0;
    this.inflight = null;
  }

  async resolve(options: {
    configured: boolean;
    notConfiguredError: string;
    load: () => Promise<T>;
    now?: number;
    force?: boolean;
  }): Promise<SourceCacheSnapshot<T>> {
    const now = options.now ?? Date.now();
    if (!options.configured) {
      return {
        configured: false,
        ok: false,
        stale: false,
        fetchedAt: null,
        error: options.notConfiguredError,
        eventCount: 0,
        data: this.empty(),
      };
    }
    if (!options.force && this.snapshot && this.freshUntil > now) {
      return this.snapshot;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.refresh(options.load)
      .catch((error): SourceCacheSnapshot<T> => this.preserveOrEmpty(error))
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async refresh(load: () => Promise<T>): Promise<SourceCacheSnapshot<T>> {
    const data = await load();
    const eventCount = this.count(data);
    if (eventCount === 0 && (this.snapshot?.eventCount ?? 0) > 0) {
      const preserved: SourceCacheSnapshot<T> = {
        ...this.snapshot!,
        ok: false,
        stale: true,
        error: "Provider returned zero rows; keeping last successful snapshot.",
      };
      this.snapshot = preserved;
      this.freshUntil = Date.now() + this.ttlMs;
      return preserved;
    }
    const next: SourceCacheSnapshot<T> = {
      configured: true,
      ok: true,
      stale: false,
      fetchedAt: new Date().toISOString(),
      error: null,
      eventCount,
      data,
    };
    this.snapshot = next;
    this.freshUntil = Date.now() + this.ttlMs;
    return next;
  }

  private preserveOrEmpty(error: unknown): SourceCacheSnapshot<T> {
    const message = sanitizeSourceError(
      error instanceof Error ? error.message : "Calendar source refresh failed.",
    );
    if (this.snapshot && this.snapshot.eventCount > 0) {
      const preserved: SourceCacheSnapshot<T> = {
        ...this.snapshot,
        ok: false,
        stale: true,
        error: message,
      };
      this.snapshot = preserved;
      return preserved;
    }
    return {
      configured: true,
      ok: false,
      stale: false,
      fetchedAt: null,
      error: message,
      eventCount: 0,
      data: this.empty(),
    };
  }
}
