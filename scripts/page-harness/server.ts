import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { HARNESS_DEFAULTS } from "./catalog";
import {
  nodeModulesLinkEscapesProject,
  resolveLinkedInstallRoot,
} from "./isolation";
import { redactSecrets } from "./util";

export type NextBundler = "turbopack" | "webpack";

export type DemoServer = {
  baseUrl: string;
  port: number;
  bundler: NextBundler;
  stop: () => Promise<void>;
};

const LOG_KEEP_CHARS = 12_000;

export function nextConfigSupportsHarnessRoot(cwd: string): boolean {
  try {
    return readFileSync(path.join(cwd, "next.config.ts"), "utf8").includes(
      "HARNESS_TURBOPACK_ROOT",
    );
  } catch {
    return false;
  }
}

export function chooseNextBundler(cwd: string): NextBundler {
  if (!nodeModulesLinkEscapesProject(cwd)) return "turbopack";
  return nextConfigSupportsHarnessRoot(cwd) ? "turbopack" : "webpack";
}

export function nextDevArgs(options: {
  port: number;
  bundler: NextBundler;
}): string[] {
  return [
    "node_modules/next/dist/bin/next",
    "dev",
    ...(options.bundler === "webpack" ? (["--webpack"] as const) : []),
    "--hostname",
    "127.0.0.1",
    "--port",
    String(options.port),
  ];
}

export function formatNextFailure(kind: string, detail: string, logs: string): string {
  const trimmed = redactSecrets(logs).trim();
  return trimmed
    ? `${kind}${detail}\n${trimmed.slice(-LOG_KEEP_CHARS)}`
    : `${kind}${detail}`;
}

export type DemoReadyProbe = {
  healthOk: boolean;
  loginOk: boolean;
};

export async function probeDemoReady(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DemoReadyProbe> {
  const healthOk = await healthReady(baseUrl, fetchImpl);
  if (!healthOk) return { healthOk: false, loginOk: false };
  const loginOk = await loginReady(baseUrl, fetchImpl);
  return { healthOk, loginOk };
}

async function healthReady(baseUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/health`);
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

async function loginReady(baseUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl}/login`);
    if (!response.ok) return false;
    const html = await response.text();
    return /<!doctype html|<html|sign in|ib market data/i.test(html);
  } catch {
    return false;
  }
}

export async function waitForDemoReady(options: {
  baseUrl: string;
  timeoutMs: number;
  isAlive: () => { ok: boolean; detail?: string };
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logs?: () => string;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();
  while (now() - started < options.timeoutMs) {
    const alive = options.isAlive();
    if (!alive.ok) {
      throw new Error(
        formatNextFailure(
          alive.detail ?? "Next.js is not running",
          "",
          options.logs?.() ?? "",
        ),
      );
    }
    const probe = await probeDemoReady(options.baseUrl, fetchImpl);
    if (probe.healthOk && probe.loginOk) return;
    await sleep(500);
  }
  throw new Error(
    formatNextFailure(
      `Timed out waiting for demo server on ${options.baseUrl}`,
      " Health and /login must both succeed before authentication.",
      options.logs?.() ?? "",
    ),
  );
}

function demoEnv(
  port: number,
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extra,
    DEMO_MODE: "true",
    ALLOW_MOCK_PROVIDERS: "true",
    NODE_ENV: "development",
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    E2E_DIST_DIR: extra.E2E_DIST_DIR || HARNESS_DEFAULTS.distDir,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  };
}

export async function startDemoServer(options: {
  cwd: string;
  port?: number;
  timeoutMs?: number;
  logFile?: string;
}): Promise<DemoServer> {
  const port = options.port ?? HARNESS_DEFAULTS.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const bundler = chooseNextBundler(options.cwd);
  const installRoot =
    bundler === "turbopack" ? resolveLinkedInstallRoot(options.cwd) : null;
  const extraEnv: Record<string, string | undefined> = {};
  if (installRoot) extraEnv.HARNESS_TURBOPACK_ROOT = installRoot;

  if (options.logFile) {
    mkdirSync(path.dirname(options.logFile), { recursive: true });
    writeFileSync(options.logFile, "", "utf8");
  }

  const child: ChildProcess = spawn(process.execPath, nextDevArgs({ port, bundler }), {
    cwd: options.cwd,
    env: demoEnv(port, extraEnv),
    windowsHide: true,
    stdio: "pipe",
  });

  let logs = "";
  let spawnError: unknown = null;
  const appendLog = (chunk: string | Buffer) => {
    const text = String(chunk);
    logs = `${logs}${text}`.slice(-LOG_KEEP_CHARS * 2);
    if (options.logFile) {
      appendFileSync(options.logFile, redactSecrets(text), "utf8");
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", appendLog);
  child.stderr?.on("data", appendLog);
  child.on("error", (error) => {
    spawnError = error;
    appendLog(error.stack || error.message);
  });

  const timeoutMs = options.timeoutMs ?? 180_000;
  try {
    await waitForDemoReady({
      baseUrl,
      timeoutMs,
      fetchImpl: fetch,
      logs: () => logs,
      isAlive: () => {
        if (spawnError) {
          const message =
            spawnError instanceof Error ? spawnError.message : String(spawnError);
          return { ok: false, detail: `Next.js failed to spawn: ${message}` };
        }
        if (child.exitCode != null) {
          return {
            ok: false,
            detail: `Next.js exited early with code ${child.exitCode}`,
          };
        }
        return { ok: true };
      },
    });
  } catch (error) {
    await stopProcess(child);
    throw error;
  }
  return {
    baseUrl,
    port,
    bundler,
    stop: async () => stopProcess(child),
  };
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.pid == null) return;
  const pid = child.pid;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode == null) child.kill("SIGKILL");
}
