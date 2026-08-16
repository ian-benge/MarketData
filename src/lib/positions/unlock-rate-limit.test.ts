import { describe, expect, it } from "vitest";
import {
  recordUnlockFailure,
  resetUnlockAttempts,
  UNLOCK_FAILURE_LIMIT,
  unlockAttemptsBlocked,
} from "./unlock-rate-limit";

describe("unlock rate limit", () => {
  it("blocks after 20 failures in the window", () => {
    const store = { failures: new Map<string, number[]>() };
    resetUnlockAttempts(store);
    const now = 1_000_000;
    for (let i = 0; i < UNLOCK_FAILURE_LIMIT; i += 1) {
      recordUnlockFailure("viewer", "owner", now + i, store);
    }
    expect(unlockAttemptsBlocked("viewer", "owner", now + 20, store)).toBe(true);
    expect(unlockAttemptsBlocked("viewer", "other", now + 20, store)).toBe(false);
  });
});
