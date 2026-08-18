import { describe, expect, it } from "vitest";
import {
  createHarnessServerLease,
  createNoopServerLease,
  requiresServer,
  intendedHarnessOrigin,
  assertHarnessOrigin,
} from "./server-lease";
import { InfrastructureFailure } from "./failure";
import { ArtifactStore, createRunPaths } from "./artifacts";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("phase-aware server lease", () => {
  it("does not require a server at DUAL_REVIEW", () => {
    expect(requiresServer("DUAL_REVIEW")).toBe(false);
    expect(requiresServer("PLAN")).toBe(false);
    expect(requiresServer("CONTRACT_LOCK")).toBe(false);
    expect(requiresServer("BASELINE")).toBe(true);
    expect(requiresServer("VERIFY")).toBe(true);
    expect(requiresServer("EVALUATE")).toBe(true);
    expect(requiresServer("OPTIONAL_SKEPTIC")).toBe(true);
  });

  it("does not start a server when resuming at DUAL_REVIEW", async () => {
    let started = 0;
    const lease = createHarnessServerLease({
      cwd: process.cwd(),
      port: 3200,
      start: async () => {
        started += 1;
        throw new Error("should not start");
      },
      probe: async () => ({ healthOk: false, loginOk: false }),
    });
    const result = await lease.ensure("DUAL_REVIEW");
    expect(started).toBe(0);
    expect(result.started).toBe(false);
    expect(result.probed).toBe(false);
    expect(result.origin).toBe(intendedHarnessOrigin(3200));
  });

  it("acquires a server when transitioning into VERIFY", async () => {
    let started = 0;
    const lease = createHarnessServerLease({
      cwd: process.cwd(),
      port: 3200,
      start: async () => {
        started += 1;
        return {
          baseUrl: "http://127.0.0.1:3200",
          port: 3200,
          bundler: "turbopack",
          stop: async () => {},
        };
      },
      probe: async () =>
        started === 0
          ? { healthOk: false, loginOk: false }
          : { healthOk: true, loginOk: true },
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/demo")) {
          return new Response(JSON.stringify({ ok: true, role: "member" }), {
            status: 200,
            headers: { "set-cookie": "ib_demo_role=member", "content-type": "application/json" },
          });
        }
        return new Response("<html>ok</html>", { status: 200 });
      }) as typeof fetch,
    });
    await lease.ensure("DUAL_REVIEW");
    expect(started).toBe(0);
    const verify = await lease.ensure("VERIFY");
    expect(started).toBe(1);
    expect(verify.started).toBe(true);
    expect(verify.origin).toBe("http://127.0.0.1:3200");
  });

  it("restarts a stale persisted port instead of trusting it", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "phr-lease-"));
    try {
      const paths = createRunPaths(tmp, "lease-stale");
      const store = new ArtifactStore(paths);
      store.writeJson("server-handle.json", {
        origin: "http://127.0.0.1:3200",
        port: 3200,
        pid: 99999,
        startedAt: "2026-08-18T16:14:54.000Z",
        lastProbeAt: "2026-08-18T16:14:54.000Z",
        owned: true,
      });
      let started = 0;
      const lease = createHarnessServerLease({
        cwd: process.cwd(),
        port: 3200,
        store,
        start: async () => {
          started += 1;
          return {
            baseUrl: "http://127.0.0.1:3200",
            port: 3200,
            bundler: "webpack",
            stop: async () => {},
          };
        },
        probe: async () =>
          started === 0
            ? { healthOk: false, loginOk: false }
            : { healthOk: true, loginOk: true },
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/auth/demo")) {
            return new Response(JSON.stringify({ ok: true, role: "member" }), { status: 200 });
          }
          return new Response("ok", { status: 200 });
        }) as typeof fetch,
      });
      const result = await lease.ensure("VERIFY");
      expect(started).toBe(1);
      expect(result.restarted).toBe(true);
      expect(result.origin).toBe("http://127.0.0.1:3200");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("classifies origin mismatch as infrastructure failure", () => {
    expect(() =>
      assertHarnessOrigin("http://localhost:3200", "http://127.0.0.1:3200"),
    ).toThrow(InfrastructureFailure);
  });

  it("noop lease never starts a server", async () => {
    const lease = createNoopServerLease("http://127.0.0.1:3200");
    const result = await lease.ensure("VERIFY");
    expect(result.started).toBe(false);
    expect(result.origin).toBe("http://127.0.0.1:3200");
  });
});
