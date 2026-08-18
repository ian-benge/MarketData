import { describe, expect, it } from "vitest";
import { runPreflight } from "./preflight";
import { fileMatchesGlob, affectedAdjacentPages } from "./verify";
import { inventoryRoutes } from "./routes-inventory";
import { decidePreTool, decideSubagent } from "../../.cursor/hooks/policy.mjs";

describe("hook and sandbox preflight", () => {
  it("requires project hooks and harness safety", () => {
    const result = runPreflight(process.cwd());
    expect(result.ok).toBe(true);
    expect(result.hooks.every((hook) => hook.present)).toBe(true);
    expect(result.safety.pushDenied).toBe(true);
  });
});

describe("regression detection", () => {
  it("maps shared component edits to adjacent catalog pages", () => {
    expect(fileMatchesGlob("src/components/ui/AccessFrame.tsx", "src/components/ui/**")).toBe(
      true,
    );
    const hits = affectedAdjacentPages("/denied", [
      "src/components/ui/AccessFrame.tsx",
    ]);
    expect(hits.some((page) => page.route === "/login")).toBe(true);
  });
});

describe("route inventory", () => {
  it("lists real app routes without modifying code", () => {
    const rows = inventoryRoutes(process.cwd());
    expect(rows.some((row) => row.route === "/settings")).toBe(true);
    expect(rows.some((row) => row.route === "/denied" && row.recommendedRisk === "low")).toBe(
      true,
    );
  });
});

describe("harness hook policy", () => {
  it("denies subagents and non-allowlisted MCP while the harness is active", () => {
    const previous = process.env.PAGE_HARNESS_ACTIVE;
    process.env.PAGE_HARNESS_ACTIVE = "1";
    try {
      expect(decideSubagent().permission).toBe("deny");
      expect(decidePreTool({ tool_name: "Task" }).permission).toBe("deny");
      expect(
        decidePreTool({
          tool_name: "Shell",
          tool_input: { command: "git push origin HEAD" },
        }).permission,
      ).toBe("deny");
    } finally {
      if (previous === undefined) delete process.env.PAGE_HARNESS_ACTIVE;
      else process.env.PAGE_HARNESS_ACTIVE = previous;
    }
  });
});
