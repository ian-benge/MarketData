import { describe, expect, it } from "vitest";
import { isEvidenceFresh } from "./evidence";
import { redactSecrets } from "./util";

describe("evidence freshness and secret redaction", () => {
  it("rejects stale or mismatched evidence metadata", () => {
    const meta = {
      runId: "r1",
      route: "/denied",
      contractHash: "abc",
      iteration: 1,
      worktreeSha: "sha",
      timestamp: "2026-08-17T12:00:00.000Z",
      serverOrigin: "http://127.0.0.1:3200",
      browser: "chrome",
      generatingCommand: "inspectRoute",
    };
    expect(
      isEvidenceFresh({ meta, runId: "r1", route: "/denied", contractHash: "abc", iteration: 1 }).ok,
    ).toBe(true);
    expect(
      isEvidenceFresh({
        meta,
        runId: "r1",
        route: "/denied",
        contractHash: "abc",
        iteration: 2,
      }).ok,
    ).toBe(false);
    expect(
      isEvidenceFresh({
        meta: { ...meta, contractHash: "pending" },
        runId: "r1",
        route: "/denied",
        contractHash: "locked".padEnd(16, "x"),
        iteration: 0,
        phase: "audit",
      }).ok,
    ).toBe(false);
    expect(
      isEvidenceFresh({
        meta: { ...meta, worktreeSha: "base" },
        runId: "r1",
        route: "/denied",
        contractHash: "abc",
        iteration: 1,
        requiredWorktreeSha: "checkpoint",
        phase: "post_edit",
      }).reason,
    ).toMatch(/worktree SHA/);
  });

  it("redacts secrets and token-shaped values", () => {
    const previous = process.env.CURSOR_API_KEY;
    process.env.CURSOR_API_KEY = "cursor_testharnesssecretvalue";
    try {
      expect(redactSecrets("key=cursor_testharnesssecretvalue")).toContain("[redacted");
      expect(redactSecrets("Authorization: Bearer abc")).toContain("[redacted]");
    } finally {
      if (previous === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = previous;
    }
  });
});
