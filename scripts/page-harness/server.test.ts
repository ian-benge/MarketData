import { describe, expect, it } from "vitest";
import {
  chooseNextBundler,
  formatNextFailure,
  nextConfigSupportsHarnessRoot,
  nextDevArgs,
  waitForDemoReady,
} from "./server";

describe("demo Next server", () => {
  it("uses turbopack args by default and webpack when requested", () => {
    expect(nextDevArgs({ port: 3200, bundler: "turbopack" })).toEqual([
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3200",
    ]);
    expect(nextDevArgs({ port: 3200, bundler: "webpack" })).toContain("--webpack");
  });

  it("includes Next logs in startup failures", () => {
    expect(
      formatNextFailure(
        "Next.js exited early with code 1",
        "",
        "Symlink [project]/node_modules is invalid, it points out of the filesystem root",
      ),
    ).toContain("filesystem root");
  });

  it("detects harness turbopack.root support in this repo", () => {
    expect(nextConfigSupportsHarnessRoot(process.cwd())).toBe(true);
    expect(chooseNextBundler(process.cwd())).toBe("turbopack");
  });

  it("times out when health and login never become ready", async () => {
    let now = 0;
    await expect(
      waitForDemoReady({
        baseUrl: "http://127.0.0.1:3200",
        timeoutMs: 1000,
        now: () => now,
        sleep: async () => {
          now += 500;
        },
        isAlive: () => ({ ok: true }),
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: false }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      }),
    ).rejects.toThrow(/Timed out waiting for demo server/);
  });
});
