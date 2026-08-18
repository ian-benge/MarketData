import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { rolePermissions, type AgentPurpose } from "./permissions";
import { decideReadPath, decideShellCommand } from "./safety";
import {
  formatSandboxNote,
  resolveSandboxPolicy,
  sandboxPolicySnapshot,
  type SandboxPolicy,
  type SandboxResolveInput,
} from "./sandbox";

export type PreflightResult = {
  ok: boolean;
  sandboxRequested: boolean;
  sandboxNote: string;
  sandbox: ReturnType<typeof sandboxPolicySnapshot>;
  sandboxPolicy: SandboxPolicy;
  hooks: Array<{ hook: string; command: string; present: boolean }>;
  rolePermissions: ReturnType<typeof rolePermissions>[];
  safety: {
    pushDenied: boolean;
    envDenied: boolean;
    exampleAllowed: boolean;
  };
  failures: string[];
};

const REQUIRED_HOOKS = [
  { hook: "beforeShellExecution", file: ".cursor/hooks/before-shell.mjs" },
  { hook: "beforeReadFile", file: ".cursor/hooks/before-read-file.mjs" },
  { hook: "preToolUse", file: ".cursor/hooks/before-tool.mjs" },
  { hook: "subagentStart", file: ".cursor/hooks/before-subagent.mjs" },
  { hook: "beforeMCPExecution", file: ".cursor/hooks/before-mcp.mjs" },
];

export function runPreflight(
  repoRoot: string,
  sandboxInput: Partial<SandboxResolveInput> & {
    needsBuilder?: boolean;
    allowNoSandbox?: boolean;
  } = {},
): PreflightResult {
  const failures: string[] = [];
  const hooksJsonPath = path.join(repoRoot, ".cursor/hooks.json");
  if (!existsSync(hooksJsonPath)) {
    failures.push("missing .cursor/hooks.json");
  } else {
    const parsed = JSON.parse(readFileSync(hooksJsonPath, "utf8")) as {
      hooks?: Record<string, Array<{ command?: string; failClosed?: boolean }>>;
    };
    for (const required of REQUIRED_HOOKS) {
      const entries = parsed.hooks?.[required.hook] ?? [];
      if (!entries.some((entry) => entry.command?.includes(path.basename(required.file)))) {
        failures.push(`hooks.json missing ${required.hook} → ${required.file}`);
      }
    }
  }

  const hooks = REQUIRED_HOOKS.map((required) => {
    const present = existsSync(path.join(repoRoot, required.file));
    if (!present) failures.push(`missing ${required.file}`);
    return { hook: required.hook, command: required.file, present };
  });

  const sandboxPolicy = resolveSandboxPolicy({
    env: sandboxInput.env,
    platform: sandboxInput.platform,
    cwd: sandboxInput.cwd ?? repoRoot,
    needsBuilder: sandboxInput.needsBuilder ?? false,
    allowNoSandbox: sandboxInput.allowNoSandbox ?? false,
    capability: sandboxInput.capability,
  });
  const sandbox = sandboxPolicySnapshot(sandboxPolicy);
  const sandboxNote = formatSandboxNote(sandboxPolicy);
  if (!sandboxPolicy.fallbackAllowed && sandboxPolicy.effective !== "enabled") {
    failures.push(sandboxNote);
  }

  const purposes: AgentPurpose[] = [
    "planner",
    "contract_reviewer",
    "builder",
    "evaluator",
    "skeptic",
  ];
  const perms = purposes.map(rolePermissions);

  const push = decideShellCommand("git push origin main", { PAGE_HARNESS_ACTIVE: "1" });
  const envRead = decideReadPath(path.join(repoRoot, ".env.local"));
  const example = decideReadPath(path.join(repoRoot, ".env.example"));
  const safety = {
    pushDenied: push.permission === "deny",
    envDenied: envRead.permission === "deny",
    exampleAllowed: example.permission === "allow",
  };
  if (!safety.pushDenied) failures.push("harness git push was not denied");
  if (!safety.envDenied) failures.push(".env.local was not denied");
  if (!safety.exampleAllowed) failures.push(".env.example was not allowed");

  return {
    ok: failures.length === 0,
    sandboxRequested: sandboxPolicy.requested === "enabled",
    sandboxNote,
    sandbox,
    sandboxPolicy,
    hooks,
    rolePermissions: perms,
    safety,
    failures,
  };
}
