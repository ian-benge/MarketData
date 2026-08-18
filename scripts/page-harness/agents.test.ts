import { describe, expect, it } from "vitest";
import {
  BUILDER_DISALLOWED_TOOLS,
  READ_ONLY_DISALLOWED_TOOLS,
  READ_ONLY_TOOLS,
  REQUEST_TESTS_INPUT_SCHEMA,
  parseRequestTestsArgs,
  shouldEnableSandbox,
  toolRestrictions,
} from "./agents";
import { rolePermissions } from "./permissions";

describe("SDK tool restrictions", () => {
  it("never sends the invalid public name write", () => {
    expect(READ_ONLY_DISALLOWED_TOOLS).not.toContain("write");
    expect(BUILDER_DISALLOWED_TOOLS).not.toContain("write");
    expect(READ_ONLY_TOOLS).toContain("mcp");
  });

  it("keeps planner/evaluator off shell, edit, and subagents", () => {
    const { tools, disallowedTools } = toolRestrictions("planner");
    expect(tools).toEqual(READ_ONLY_TOOLS);
    expect(disallowedTools).toEqual(
      expect.arrayContaining(["edit", "delete", "shell", "task"]),
    );
    expect(disallowedTools).not.toContain("piWrite");
  });

  it("treats PAGE_HARNESS_SANDBOX as a request only, not as capability", () => {
    expect(shouldEnableSandbox({ PAGE_HARNESS_SANDBOX: "0" }, "linux")).toBe(false);
    expect(shouldEnableSandbox({ PAGE_HARNESS_SANDBOX: "1" }, "win32")).toBe(true);
    expect(shouldEnableSandbox({}, "win32")).toBe(false);
    expect(shouldEnableSandbox({}, "linux")).toBe(true);
  });

  it("lets the builder edit but not spawn task subagents", () => {
    const { tools, disallowedTools } = toolRestrictions("builder");
    expect(tools).toEqual(expect.arrayContaining(["edit", "shell", "mcp"]));
    expect(disallowedTools).toEqual(expect.arrayContaining(["task", "webSearch"]));
  });

  it("limits contract reviewers to artifacts only", () => {
    const perms = rolePermissions("contract_reviewer");
    expect(perms.customToolNames).toEqual(["submit_artifact"]);
    expect(perms.allowedArtifacts).toEqual(["contract-decision"]);
    expect(perms.readOnly).toBe(true);
  });

  it("accepts an omitted or empty request_tests payload", () => {
    expect(Object.keys(REQUEST_TESTS_INPUT_SCHEMA.properties).length).toBeGreaterThan(0);
    expect(parseRequestTestsArgs(undefined)).toEqual({});
    expect(parseRequestTestsArgs({})).toEqual({});
  });
});
