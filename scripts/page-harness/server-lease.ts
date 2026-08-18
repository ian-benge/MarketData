import type { ArtifactStore } from "./artifacts";
import { InfrastructureFailure } from "./failure";
import type { HarnessPhase } from "./phases";
import type { PageRole } from "./catalog";
import {
  probeDemoReady,
  startDemoServer,
  waitForDemoReady,
  type DemoServer,
} from "./server";
import { nowIso } from "./util";

export type ServerHandleState = {
  origin: string;
  port: number;
  pid: number | null;
  startedAt: string | null;
  lastProbeAt: string | null;
  owned: boolean;
};

export type EnsureServerResult = {
  origin: string;
  started: boolean;
  restarted: boolean;
  probed: boolean;
};

export type ServerLease = {
  origin(): string;
  handle(): ServerHandleState | null;
  ensure(phase: HarnessPhase | null): Promise<EnsureServerResult>;
  probeAlive(origin?: string): Promise<{ ok: boolean; reason?: string }>;
  stop(): Promise<void>;
};

const HANDLE_FILE = "server-handle.json";

export function requiresServer(phase: HarnessPhase | null): boolean {
  return (
    phase === "BASELINE" ||
    phase === "VERIFY" ||
    phase === "EVALUATE" ||
    phase === "OPTIONAL_SKEPTIC"
  );
}

export function intendedHarnessOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export function assertHarnessOrigin(origin: string, expected: string): void {
  let actual: string;
  let wanted: string;
  try {
    actual = new URL(origin).origin;
    wanted = new URL(expected).origin;
  } catch {
    throw new InfrastructureFailure(
      `Demo server origin is not a valid URL (got ${origin}, expected ${expected}).`,
    );
  }
  if (actual !== wanted) {
    throw new InfrastructureFailure(
      `Demo server origin ${actual} does not match harness origin ${wanted}.`,
    );
  }
}

export function createNoopServerLease(origin: string): ServerLease {
  return {
    origin: () => origin,
    handle: () => null,
    async ensure() {
      return { origin, started: false, restarted: false, probed: false };
    },
    async probeAlive() {
      return { ok: true };
    },
    async stop() {},
  };
}

export function createHarnessServerLease(options: {
  cwd: string;
  port: number;
  logFile?: string;
  store?: ArtifactStore;
  role?: PageRole;
  route?: string;
  externalOrigin?: string;
  start?: typeof startDemoServer;
  probe?: typeof probeDemoReady;
  fetchImpl?: typeof fetch;
  wait?: typeof waitForDemoReady;
}): ServerLease {
  const intended = options.externalOrigin ?? intendedHarnessOrigin(options.port);
  const start = options.start ?? startDemoServer;
  const probe = options.probe ?? probeDemoReady;
  const fetchImpl = options.fetchImpl ?? fetch;
  const owned = !options.externalOrigin;
  let live: DemoServer | null = null;
  let handle: ServerHandleState | null = readHandle(options.store);

  const persist = (next: ServerHandleState | null) => {
    handle = next;
    if (options.store && next) options.store.writeJson(HANDLE_FILE, next);
  };

  const lease: ServerLease = {
    origin: () => handle?.origin ?? intended,
    handle: () => handle,
    async probeAlive(origin = handle?.origin ?? intended) {
      try {
        const result = await probe(origin, fetchImpl);
        if (result.healthOk && result.loginOk) return { ok: true };
        return {
          ok: false,
          reason: `server-readiness failed on ${origin} (health=${result.healthOk}, login=${result.loginOk})`,
        };
      } catch (error) {
        return {
          ok: false,
          reason: infrastructureMessage(origin, error),
        };
      }
    },
    async ensure(phase) {
      if (!requiresServer(phase)) {
        return { origin: intended, started: false, restarted: false, probed: false };
      }
      const persisted = handle?.origin ?? intended;
      const alive = await lease.probeAlive(persisted);
      if (alive.ok) {
        assertHarnessOrigin(persisted, intended);
        await verifyDemoAuthAndRoute({
          origin: persisted,
          role: options.role ?? "member",
          route: options.route ?? "/",
          fetchImpl,
        });
        persist({
          origin: persisted,
          port: portOf(persisted) ?? options.port,
          pid: handle?.pid ?? null,
          startedAt: handle?.startedAt ?? null,
          lastProbeAt: nowIso(),
          owned: handle?.owned ?? owned,
        });
        return { origin: persisted, started: false, restarted: false, probed: true };
      }

      if (!owned) {
        throw new InfrastructureFailure(
          alive.reason ??
            `External demo server at ${persisted} is absent or stale.`,
        );
      }

      if (live) {
        await live.stop();
        live = null;
      }

      try {
        live = await start({
          cwd: options.cwd,
          port: options.port,
          logFile: options.logFile,
        });
      } catch (error) {
        throw new InfrastructureFailure(infrastructureMessage(intended, error));
      }

      const startedOrigin = live.baseUrl;
      assertHarnessOrigin(startedOrigin, intended);
      const ready = await lease.probeAlive(startedOrigin);
      if (!ready.ok) {
        await live.stop();
        live = null;
        throw new InfrastructureFailure(
          ready.reason ?? `server-readiness failed on ${startedOrigin}`,
        );
      }
      await verifyDemoAuthAndRoute({
        origin: startedOrigin,
        role: options.role ?? "member",
        route: options.route ?? "/",
        fetchImpl,
      });
      const restarted = Boolean(handle);
      persist({
        origin: startedOrigin,
        port: live.port,
        pid: null,
        startedAt: nowIso(),
        lastProbeAt: nowIso(),
        owned: true,
      });
      return {
        origin: startedOrigin,
        started: true,
        restarted,
        probed: true,
      };
    },
    async stop() {
      if (live) {
        await live.stop();
        live = null;
      }
    },
  };
  return lease;
}

async function verifyDemoAuthAndRoute(options: {
  origin: string;
  role: PageRole;
  route: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const demoRole = options.role === "admin" ? "admin" : "member";
  let response: Response;
  try {
    response = await options.fetchImpl(`${options.origin}/api/auth/demo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: demoRole }),
    });
  } catch (error) {
    throw new InfrastructureFailure(
      infrastructureMessage(`${options.origin}/api/auth/demo`, error),
    );
  }
  if (!response.ok) {
    throw new InfrastructureFailure(
      `Demo authentication failed on ${options.origin}/api/auth/demo (HTTP ${response.status}).`,
    );
  }
  const cookie = response.headers.get("set-cookie") ?? "";
  const routeUrl = `${options.origin}${options.route.startsWith("/") ? options.route : `/${options.route}`}`;
  try {
    const page = await options.fetchImpl(routeUrl, {
      headers: cookie ? { cookie } : undefined,
      redirect: "manual",
    });
    void page;
  } catch (error) {
    throw new InfrastructureFailure(infrastructureMessage(routeUrl, error));
  }
}

function infrastructureMessage(target: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/econnrefused|err_connection_refused/i.test(message)) {
    return `connect ECONNREFUSED while reaching ${target}`;
  }
  if (/timed out waiting for demo server/i.test(message)) {
    return message;
  }
  return `Infrastructure failure reaching ${target}: ${message}`;
}

function portOf(origin: string): number | null {
  try {
    const port = new URL(origin).port;
    return port ? Number(port) : null;
  } catch {
    return null;
  }
}

function readHandle(store?: ArtifactStore): ServerHandleState | null {
  if (!store) return null;
  const raw = store.readJson(HANDLE_FILE) as ServerHandleState | null;
  if (!raw || typeof raw.origin !== "string") return null;
  return raw;
}
