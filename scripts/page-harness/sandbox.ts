import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { rolePermissions, type AgentPurpose } from "./permissions";

export const SANDBOX_UNAVAILABLE = "SANDBOX_UNAVAILABLE";

export const READ_ONLY_PURPOSES: AgentPurpose[] = [
  "planner",
  "contract_reviewer",
  "evaluator",
  "skeptic",
];

export const MUTATING_TOOLS = ["edit", "delete", "shell"] as const;

export type SandboxRequestedMode = "enabled" | "disabled";
export type SandboxEffectiveMode = "enabled" | "disabled";

export type SandboxCapability = {
  supported: boolean;
  helperPresent: boolean;
  helperName: string;
  reason: string;
  platform: NodeJS.Platform;
};

export type SandboxPolicy = {
  requested: SandboxRequestedMode;
  detected: SandboxCapability;
  effective: SandboxEffectiveMode;
  fallbackReason: string | null;
  fallbackAllowed: boolean;
  mutatingToolsBlocked: boolean;
  allowNoSandbox: boolean;
  needsBuilder: boolean;
};

export type SandboxResolveInput = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  cwd?: string;
  needsBuilder: boolean;
  allowNoSandbox: boolean;
  capability?: SandboxCapability;
};

/**
 * Requested mode only. Does not mean the SDK can honor it.
 * Windows defaults off; PAGE_HARNESS_SANDBOX=1 opts in to a request.
 */
export function requestedSandboxMode(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): SandboxRequestedMode {
  if (env.PAGE_HARNESS_SANDBOX === "0") return "disabled";
  if (env.PAGE_HARNESS_SANDBOX === "1") return "enabled";
  return platform === "win32" ? "disabled" : "enabled";
}

export function sandboxHelperName(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "cursorsandbox.exe" : "cursorsandbox";
}

export function findSandboxHelper(
  cwd = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): string | null {
  const helperName = sandboxHelperName(platform);
  const packages = [
    "@cursor/sdk-win32-x64",
    "@cursor/sdk-linux-x64",
    "@cursor/sdk-linux-arm64",
    "@cursor/sdk-darwin-x64",
    "@cursor/sdk-darwin-arm64",
  ];
  for (const pkg of packages) {
    const root = path.join(cwd, "node_modules", pkg);
    const found = findFileNamed(root, helperName, 4);
    if (found) return found;
  }
  return null;
}

function findFileNamed(dir: string, name: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (entry === name) return full;
    try {
      if (depth > 0 && statSync(full).isDirectory()) {
        const nested = findFileNamed(full, name, depth - 1);
        if (nested) return nested;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Mirrors installed @cursor/sdk local-executor behavior:
 * Windows helper is proxy-only and isSandboxSupported is hard-false;
 * macOS requires /usr/bin/sandbox-exec; Linux needs the platform helper.
 */
export function detectSandboxCapability(
  platform: NodeJS.Platform = process.platform,
  options: {
    cwd?: string;
    helperPath?: string | null;
    darwinSandboxExecExists?: boolean;
  } = {},
): SandboxCapability {
  const helperName = sandboxHelperName(platform);
  const helperPath =
    options.helperPath === undefined
      ? findSandboxHelper(options.cwd ?? process.cwd(), platform)
      : options.helperPath;
  const helperPresent = Boolean(helperPath);

  if (platform === "win32") {
    return {
      supported: false,
      helperPresent,
      helperName,
      reason:
        "Windows sandbox helper only provides network proxy, not filesystem isolation",
      platform,
    };
  }

  if (platform === "darwin") {
    const execExists = options.darwinSandboxExecExists ?? existsSync("/usr/bin/sandbox-exec");
    if (!execExists) {
      return {
        supported: false,
        helperPresent,
        helperName,
        reason: "/usr/bin/sandbox-exec is not available",
        platform,
      };
    }
    return {
      supported: true,
      helperPresent,
      helperName,
      reason: "macOS sandbox-exec is available",
      platform,
    };
  }

  if (!helperPresent) {
    return {
      supported: false,
      helperPresent,
      helperName,
      reason: `${helperName} was not found in the installed SDK platform package`,
      platform,
    };
  }

  return {
    supported: true,
    helperPresent,
    helperName,
    reason: "Linux sandbox helper is present",
    platform,
  };
}

export function readOnlyRolesHaveNoMutatingTools(): boolean {
  return READ_ONLY_PURPOSES.every((purpose) => {
    const perms = rolePermissions(purpose);
    if (!perms.readOnly) return false;
    const offered = new Set(perms.tools);
    return MUTATING_TOOLS.every(
      (tool) => !offered.has(tool) && perms.disallowedTools.includes(tool),
    );
  });
}

export class SandboxRequiredError extends Error {
  readonly policy: SandboxPolicy;

  constructor(policy: SandboxPolicy) {
    super(
      [
        "Local SDK filesystem sandboxing is unavailable.",
        policy.detected.reason,
        "An improvement run that creates a builder must pass --allow-no-sandbox to continue with isolated worktrees, role tool allowlists, hooks, and autoReview.",
        "This acknowledgement is required; protection is not silently weakened.",
      ].join(" "),
    );
    this.name = "SandboxRequiredError";
    this.policy = policy;
  }
}

export function resolveSandboxPolicy(input: SandboxResolveInput): SandboxPolicy {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const requested = requestedSandboxMode(env, platform);
  const detected =
    input.capability ??
    detectSandboxCapability(platform, { cwd: input.cwd });
  const mutatingToolsBlocked = readOnlyRolesHaveNoMutatingTools();
  const needsBuilder = input.needsBuilder;
  const allowNoSandbox = input.allowNoSandbox;

  if (detected.supported && requested === "enabled") {
    return {
      requested,
      detected,
      effective: "enabled",
      fallbackReason: null,
      fallbackAllowed: true,
      mutatingToolsBlocked,
      allowNoSandbox,
      needsBuilder,
    };
  }

  const reason = detected.supported
    ? "sandbox disabled by PAGE_HARNESS_SANDBOX=0"
    : `${SANDBOX_UNAVAILABLE}: ${detected.reason}`;

  const auditFallback = !needsBuilder && mutatingToolsBlocked;
  const builderAck = needsBuilder && allowNoSandbox;
  const fallbackAllowed = auditFallback || builderAck;

  return {
    requested,
    detected,
    effective: "disabled",
    fallbackReason: reason,
    fallbackAllowed,
    mutatingToolsBlocked,
    allowNoSandbox,
    needsBuilder,
  };
}

export function assertSandboxPolicyAllowsRun(policy: SandboxPolicy): void {
  if (policy.effective === "enabled") return;
  if (policy.fallbackAllowed) return;
  throw new SandboxRequiredError(policy);
}

/**
 * Always pass an explicit boolean. `{ enabled: false }` is required when
 * unsupported: omitting sandboxOptions still honors ~/.cursor/sandbox.json,
 * and `{ enabled: true }` throws from the local executor on send().
 */
export function localSandboxOptions(policy: SandboxPolicy): { enabled: boolean } {
  if (policy.effective === "enabled" && !policy.detected.supported) {
    throw new Error(
      "Refusing to pass sandboxOptions.enabled=true; filesystem sandboxing is not supported in this environment.",
    );
  }
  return { enabled: policy.effective === "enabled" };
}

export function formatSandboxNote(policy: SandboxPolicy): string {
  const parts = [
    `requested=${policy.requested}`,
    `detected=${policy.detected.supported ? "supported" : "unsupported"}`,
    `effective=${policy.effective}`,
  ];
  if (policy.fallbackReason) parts.push(`fallback=${policy.fallbackReason}`);
  if (policy.effective === "enabled") {
    parts.push("Agent.create will pass sandboxOptions.enabled=true.");
  } else {
    parts.push(
      "Agent.create will pass sandboxOptions.enabled=false (hooks + autoReview + role allowlists remain).",
    );
  }
  if (policy.needsBuilder && !policy.fallbackAllowed) {
    parts.push("Builder runs are blocked without --allow-no-sandbox.");
  }
  return parts.join("; ");
}

export function sandboxPolicySnapshot(policy: SandboxPolicy) {
  return {
    requested: policy.requested,
    detected: policy.detected,
    effective: policy.effective,
    fallbackReason: policy.fallbackReason,
    fallbackAllowed: policy.fallbackAllowed,
    mutatingToolsBlocked: policy.mutatingToolsBlocked,
    allowNoSandbox: policy.allowNoSandbox,
    needsBuilder: policy.needsBuilder,
    agentSandboxOptions: localSandboxOptions(policy),
    note: formatSandboxNote(policy),
  };
}
