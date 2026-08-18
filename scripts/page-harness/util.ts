import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SECRET_HINTS = [
  "KEY",
  "SECRET",
  "TOKEN",
  "PASSWORD",
  "SERVICE_ROLE",
  "AUTHORIZATION",
  "COOKIE",
  "CREDENTIAL",
];

export function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (upper.startsWith("NEXT_PUBLIC_") && !upper.includes("SECRET")) return false;
  return SECRET_HINTS.some((hint) => upper.includes(hint));
}

export function loadEnvFile(filename: string, cwd = process.cwd()): void {
  const path = resolve(cwd, filename);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let raw = trimmed.slice(eq + 1).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = raw;
    }
  }
}

export function loadHarnessEnv(cwd = process.cwd()): void {
  loadEnvFile(".env.local", cwd);
  loadEnvFile(".env", cwd);
}

export function redactSecrets(value: string): string {
  let next = value;
  for (const [key, envValue] of Object.entries(process.env)) {
    if (!envValue || envValue.length < 8 || !isSecretKey(key)) continue;
    if (next.includes(envValue)) {
      next = next.split(envValue).join(`[redacted:${key}]`);
    }
  }
  next = next.replace(
    /\b(cursor|sk|ghp|github_pat|xoxb|xoxp)_[A-Za-z0-9._-]{8,}\b/g,
    "[redacted-token]",
  );
  next = next.replace(
    /(authorization|api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\\s]+/gi,
    "$1=[redacted]",
  );
  return next;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, sortValue(val)]));
  }
  return value;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function shortId(): string {
  return createHash("sha1")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
}

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function resolveSpawn(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comspec = process.env.ComSpec || "cmd.exe",
): { command: string; args: string[] } {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return { command: comspec, args: ["/d", "/s", "/c", command, ...args] };
  }
  return { command, args };
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const resolved = resolveSpawn(command, args);
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const label = `${command} ${args.join(" ")}`;
    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            child.kill();
            reject(new Error(`${label} timed out after ${options.timeoutMs}ms`));
          }, options.timeoutMs)
        : null;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`${label}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function git(
  args: string[],
  cwd: string,
  timeoutMs = 30_000,
): Promise<CommandResult> {
  return runCommand("git", args, { cwd, timeoutMs });
}

export function requireGitOk(result: CommandResult, action: string): void {
  if (result.code !== 0) {
    throw new Error(
      `${action} failed:\n${redactSecrets(result.stderr || result.stdout)}`,
    );
  }
}

export class Logger {
  constructor(
    private readonly writeVerbose: (line: string) => void,
    private readonly prefix = "phr",
  ) {}

  info(message: string): void {
    const line = `[${this.prefix} ${timestamp()}] ${message}`;
    console.log(line);
    this.writeVerbose(line);
  }

  warn(message: string): void {
    const line = `[${this.prefix} ${timestamp()}] WARN ${message}`;
    console.warn(line);
    this.writeVerbose(line);
  }

  error(message: string): void {
    const line = `[${this.prefix} ${timestamp()}] ERROR ${message}`;
    console.error(line);
    this.writeVerbose(line);
  }

  verbose(message: string): void {
    this.writeVerbose(`[${this.prefix} ${timestamp()}] ${message}`);
  }
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}
