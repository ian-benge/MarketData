export const UNLOCK_FAILURE_LIMIT = 20;
export const UNLOCK_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export type UnlockAttemptStore = {
  failures: Map<string, number[]>;
};

const memoryStore: UnlockAttemptStore = { failures: new Map() };

export function resetUnlockAttempts(store: UnlockAttemptStore = memoryStore): void {
  store.failures.clear();
}

function keyFor(viewerId: string, ownerId: string): string {
  return `${viewerId}:${ownerId}`;
}

export function unlockAttemptsBlocked(
  viewerId: string,
  ownerId: string,
  now = Date.now(),
  store: UnlockAttemptStore = memoryStore,
): boolean {
  const stamps = store.failures.get(keyFor(viewerId, ownerId)) ?? [];
  const recent = stamps.filter((at) => now - at < UNLOCK_FAILURE_WINDOW_MS);
  store.failures.set(keyFor(viewerId, ownerId), recent);
  return recent.length >= UNLOCK_FAILURE_LIMIT;
}

export function recordUnlockFailure(
  viewerId: string,
  ownerId: string,
  now = Date.now(),
  store: UnlockAttemptStore = memoryStore,
): void {
  const stamps = store.failures.get(keyFor(viewerId, ownerId)) ?? [];
  stamps.push(now);
  store.failures.set(
    keyFor(viewerId, ownerId),
    stamps.filter((at) => now - at < UNLOCK_FAILURE_WINDOW_MS),
  );
}

export function clearUnlockFailures(
  viewerId: string,
  ownerId: string,
  store: UnlockAttemptStore = memoryStore,
): void {
  store.failures.delete(keyFor(viewerId, ownerId));
}
