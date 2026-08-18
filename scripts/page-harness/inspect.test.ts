import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectRoute } from "./inspect";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("inspect cleanup after failure", () => {
  it("closes the browser when authentication or navigation throws", async () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), "phr-inspect-"));
    temps.push(outDir);
    let closed = 0;
    await expect(
      inspectRoute({
        baseUrl: "http://127.0.0.1:3200",
        route: "/settings",
        role: "member",
        outDir,
        viewports: [{ name: "desktop-1440", width: 1440, height: 900 }],
        samples: 1,
        browserFactory: async () =>
          ({
            async newContext() {
              throw new Error("Demo member sign-in failed (403)");
            },
            async close() {
              closed += 1;
            },
          }) as never,
      }),
    ).rejects.toThrow(/sign-in failed|403/);
    expect(closed).toBe(1);
  });
});
