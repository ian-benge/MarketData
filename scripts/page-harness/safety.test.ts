import { describe, expect, it } from "vitest";
import { decideReadPath, decideShellCommand, decideWritePath, findShallowSignals } from "./safety";

describe("harness safety", () => {
  it("always blocks hosted db reset and production deploys", () => {
    expect(decideShellCommand("npx supabase db reset").permission).toBe("deny");
    expect(decideShellCommand("vercel deploy --prod").permission).toBe("deny");
    expect(decideShellCommand("git push --force origin main").permission).toBe("deny");
  });

  it("blocks push and merge only while the harness is active", () => {
    expect(decideShellCommand("git push origin HEAD").permission).toBe("allow");
    expect(
      decideShellCommand("git push origin HEAD", { PAGE_HARNESS_ACTIVE: "1" }).permission,
    ).toBe("deny");
    expect(
      decideShellCommand("git merge main", { PAGE_HARNESS_ACTIVE: "1" }).permission,
    ).toBe("deny");
  });

  it("blocks secret files but allows .env.example", () => {
    expect(decideReadPath("C:/Projects/MarketData/.env.local").permission).toBe("deny");
    expect(decideReadPath("/tmp/.env").permission).toBe("deny");
    expect(decideReadPath("C:/Projects/MarketData/.env.example").permission).toBe("allow");
    expect(decideReadPath("src/app/denied/page.tsx").permission).toBe("allow");
  });

  it("flags shallow copy", () => {
    expect(findShallowSignals("Coming soon to the blotter")).toContain("Coming soon");
    expect(findShallowSignals("real P&L from /api/positions")).toEqual([]);
  });

  it("blocks destructive filesystem, credential dump, and .env writes while harness is active", () => {
    const env = { PAGE_HARNESS_ACTIVE: "1" };
    expect(decideShellCommand("rm -rf src", env).permission).toBe("deny");
    expect(decideShellCommand("printenv", env).permission).toBe("deny");
    expect(decideShellCommand("cat .env.local", env).permission).toBe("deny");
    expect(decideWritePath("C:/Projects/MarketData/.env.local").permission).toBe("deny");
  });
});
