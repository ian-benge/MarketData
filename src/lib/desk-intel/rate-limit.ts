const buckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimits() {
  buckets.clear();
}

export function rateLimit(input: {
  key: string;
  limit: number;
  windowMs?: number;
}): { ok: boolean; retryAfterSec: number } {
  const windowMs = input.windowMs ?? 60_000;
  const now = Date.now();
  const current = buckets.get(input.key);
  if (!current || now >= current.resetAt) {
    buckets.set(input.key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (current.count >= input.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true, retryAfterSec: 0 };
}
