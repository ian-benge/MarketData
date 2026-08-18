import { describe, expect, it } from "vitest";
import { buildLocalAgentCreateOptions, createAgentWithSandbox } from "./agents";
import {
  SANDBOX_UNAVAILABLE,
  SandboxRequiredError,
  assertSandboxPolicyAllowsRun,
  detectSandboxCapability,
  localSandboxOptions,
  readOnlyRolesHaveNoMutatingTools,
  requestedSandboxMode,
  resolveSandboxPolicy,
  type SandboxCapability,
} from "./sandbox";
import { runPreflight } from "./preflight";

const unsupportedWin: SandboxCapability = {
  supported: false,
  helperPresent: true,
  helperName: "cursorsandbox.exe",
  reason: "Windows sandbox helper only provides network proxy, not filesystem isolation",
  platform: "win32",
};

const supportedLinux: SandboxCapability = {
  supported: true,
  helperPresent: true,
  helperName: "cursorsandbox",
  reason: "Linux sandbox helper is present",
  platform: "linux",
};

describe("sandbox capability resolver", () => {
  it("detects Windows as unsupported even when a helper exists", () => {
    const detected = detectSandboxCapability("win32", {
      helperPath: "C:/fake/cursorsandbox.exe",
    });
    expect(detected.supported).toBe(false);
    expect(detected.helperPresent).toBe(true);
    expect(detected.reason).toMatch(/network proxy/i);
  });

  it("requests sandbox on Linux by default and on Windows only when PAGE_HARNESS_SANDBOX=1", () => {
    expect(requestedSandboxMode({ PAGE_HARNESS_SANDBOX: "0" }, "linux")).toBe("disabled");
    expect(requestedSandboxMode({ PAGE_HARNESS_SANDBOX: "1" }, "win32")).toBe("enabled");
    expect(requestedSandboxMode({}, "win32")).toBe("disabled");
    expect(requestedSandboxMode({}, "linux")).toBe("enabled");
  });

  it("never returns effective enabled when capability is unsupported", () => {
    const policy = resolveSandboxPolicy({
      env: { PAGE_HARNESS_SANDBOX: "1" },
      platform: "win32",
      needsBuilder: false,
      allowNoSandbox: false,
      capability: unsupportedWin,
    });
    expect(policy.requested).toBe("enabled");
    expect(policy.effective).toBe("disabled");
    expect(policy.fallbackAllowed).toBe(true);
    expect(policy.fallbackReason).toContain(SANDBOX_UNAVAILABLE);
    expect(localSandboxOptions(policy)).toEqual({ enabled: false });
  });

  it("passes enabled true only when the SDK platform supports filesystem sandboxing", () => {
    const policy = resolveSandboxPolicy({
      env: {},
      platform: "linux",
      needsBuilder: true,
      allowNoSandbox: false,
      capability: supportedLinux,
    });
    expect(policy.effective).toBe("enabled");
    expect(localSandboxOptions(policy)).toEqual({ enabled: true });
  });

  it("allows a read-only audit fallback after verifying mutating tools are blocked", () => {
    expect(readOnlyRolesHaveNoMutatingTools()).toBe(true);
    const policy = resolveSandboxPolicy({
      env: { PAGE_HARNESS_SANDBOX: "1" },
      platform: "win32",
      needsBuilder: false,
      allowNoSandbox: false,
      capability: unsupportedWin,
    });
    expect(policy.mutatingToolsBlocked).toBe(true);
    expect(() => assertSandboxPolicyAllowsRun(policy)).not.toThrow();
  });

  it("refuses a builder run without --allow-no-sandbox when sandboxing is unavailable", () => {
    const policy = resolveSandboxPolicy({
      env: { PAGE_HARNESS_SANDBOX: "1" },
      platform: "win32",
      needsBuilder: true,
      allowNoSandbox: false,
      capability: unsupportedWin,
    });
    expect(policy.fallbackAllowed).toBe(false);
    expect(() => assertSandboxPolicyAllowsRun(policy)).toThrow(SandboxRequiredError);
  });

  it("allows a builder only with explicit --allow-no-sandbox acknowledgement", () => {
    const policy = resolveSandboxPolicy({
      platform: "win32",
      needsBuilder: true,
      allowNoSandbox: true,
      capability: unsupportedWin,
    });
    expect(policy.fallbackAllowed).toBe(true);
    expect(localSandboxOptions(policy)).toEqual({ enabled: false });
    expect(() => assertSandboxPolicyAllowsRun(policy)).not.toThrow();
  });
});

describe("self-check and SDK agent creation share sandbox options", () => {
  it("preflight and Agent.create use the same enabled=false config when unsupported", async () => {
    const preflight = runPreflight(process.cwd(), {
      needsBuilder: false,
      allowNoSandbox: false,
      platform: "win32",
      capability: unsupportedWin,
    });
    expect(preflight.ok).toBe(true);
    expect(preflight.sandbox.agentSandboxOptions).toEqual({ enabled: false });
    const created: Array<{ local?: { sandboxOptions?: { enabled?: boolean } } }> = [];
    await createAgentWithSandbox({
      model: { id: "grok-4.6" },
      cwd: process.cwd(),
      tools: ["read"],
      disallowedTools: ["edit"],
      sandboxPolicy: preflight.sandboxPolicy,
      log: { info() {}, warn() {} },
      role: "planner",
      customTools: () => ({ submitted: [], tools: {} }),
      createAgent: async (opts) => {
        created.push(opts);
        return {
          agentId: "agent-test",
          send: async () => {
            throw new Error("send should not run in this test");
          },
          [Symbol.asyncDispose]: async () => {},
        } as never;
      },
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.local?.sandboxOptions).toEqual({ enabled: false });
    expect(created[0]?.local?.sandboxOptions).toEqual(
      buildLocalAgentCreateOptions({
        cwd: process.cwd(),
        policy: preflight.sandboxPolicy,
      }).sandboxOptions,
    );
  });

  it("does not pass enabled=true to Agent.create on an unsupported platform", async () => {
    const policy = resolveSandboxPolicy({
      env: { PAGE_HARNESS_SANDBOX: "1" },
      platform: "win32",
      needsBuilder: false,
      allowNoSandbox: false,
      capability: unsupportedWin,
    });
    let enabled: boolean | undefined;
    await createAgentWithSandbox({
      model: { id: "grok-4.6" },
      cwd: process.cwd(),
      tools: ["read"],
      disallowedTools: ["shell"],
      sandboxPolicy: policy,
      log: { info() {}, warn() {} },
      role: "planner",
      customTools: () => ({ submitted: [], tools: {} }),
      createAgent: async (opts) => {
        enabled = opts.local?.sandboxOptions?.enabled;
        if (enabled) {
          throw new Error(
            "Local SDK sandboxing was requested, but sandboxing is not supported in this environment.",
          );
        }
        return {
          agentId: "agent-test",
          [Symbol.asyncDispose]: async () => {},
        } as never;
      },
    });
    expect(enabled).toBe(false);
  });

  it("passes enabled=true when capability is supported", async () => {
    const policy = resolveSandboxPolicy({
      platform: "linux",
      needsBuilder: true,
      allowNoSandbox: false,
      capability: supportedLinux,
    });
    let enabled: boolean | undefined;
    await createAgentWithSandbox({
      model: { id: "grok-4.6" },
      cwd: process.cwd(),
      tools: ["read", "edit"],
      disallowedTools: ["task"],
      sandboxPolicy: policy,
      log: { info() {}, warn() {} },
      role: "builder",
      customTools: () => ({ submitted: [], tools: {} }),
      createAgent: async (opts) => {
        enabled = opts.local?.sandboxOptions?.enabled;
        return {
          agentId: "agent-builder",
          [Symbol.asyncDispose]: async () => {},
        } as never;
      },
    });
    expect(enabled).toBe(true);
  });

  it("fails closed if the SDK still rejects sandboxing after policy resolution", async () => {
    const policy = resolveSandboxPolicy({
      platform: "linux",
      needsBuilder: true,
      allowNoSandbox: false,
      capability: supportedLinux,
    });
    await expect(
      createAgentWithSandbox({
        model: { id: "grok-4.6" },
        cwd: process.cwd(),
        tools: ["read"],
        disallowedTools: [],
        sandboxPolicy: policy,
        log: { info() {}, warn() {} },
        role: "planner",
        customTools: () => ({ submitted: [], tools: {} }),
        createAgent: async () => {
          throw new Error(
            "Local SDK sandboxing was requested, but sandboxing is not supported in this environment.",
          );
        },
      }),
    ).rejects.toThrow(/after policy resolution/);
  });
});

describe("preflight sandbox gating", () => {
  it("keeps audit self-check green on unsupported platforms", () => {
    const result = runPreflight(process.cwd(), {
      needsBuilder: false,
      platform: "win32",
      capability: unsupportedWin,
    });
    expect(result.ok).toBe(true);
    expect(result.sandbox.effective).toBe("disabled");
  });

  it("fails improve preflight without --allow-no-sandbox when unsupported", () => {
    const result = runPreflight(process.cwd(), {
      needsBuilder: true,
      allowNoSandbox: false,
      platform: "win32",
      capability: unsupportedWin,
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toMatch(/Builder runs are blocked/);
  });
});
