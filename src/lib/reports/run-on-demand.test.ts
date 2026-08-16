import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/env";
import {
  hasLiveAiKeys,
  shouldSkipReportEmail,
  shouldUseMockAi,
} from "@/lib/reports/run-on-demand";

const fixtureMode = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>();
  return {
    ...actual,
    fixturesEnabled: () => fixtureMode.enabled,
  };
});

function env(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    ...overrides,
  } as Env;
}

describe("shouldSkipReportEmail", () => {
  it("skips report email while only position alerts are live", () => {
    expect(
      shouldSkipReportEmail({
        recipientCount: 2,
        env: env({
          RESEND_API_KEY: "re_test",
          MARKET_DATA_LICENSE_SCOPE: "redistributable",
        }),
      }),
    ).toBe(true);
  });

  it("skips email under single_user_development even with recipients and Resend", () => {
    expect(
      shouldSkipReportEmail({
        recipientCount: 2,
        env: env({
          RESEND_API_KEY: "re_test",
          MARKET_DATA_LICENSE_SCOPE: "single_user_development",
        }),
      }),
    ).toBe(true);
  });
});

describe("shouldUseMockAi", () => {
  it("is true when fixtures are enabled even if AI keys exist", () => {
    fixtureMode.enabled = true;
    expect(
      shouldUseMockAi(
        env({ OPENAI_API_KEY: "sk-test" }),
        false,
      ),
    ).toBe(true);
    fixtureMode.enabled = false;
  });

  it("is true when no live AI keys are configured", () => {
    fixtureMode.enabled = false;
    expect(hasLiveAiKeys(env())).toBe(false);
    expect(shouldUseMockAi(env(), false)).toBe(true);
  });

  it("is true when providers are using mock AI", () => {
    fixtureMode.enabled = false;
    expect(
      shouldUseMockAi(env({ OPENAI_API_KEY: "sk-test" }), true),
    ).toBe(true);
  });

  it("is false when live keys exist and providers are not mocking AI", () => {
    fixtureMode.enabled = false;
    expect(hasLiveAiKeys(env({ ANTHROPIC_API_KEY: "ak-test" }))).toBe(true);
    expect(
      shouldUseMockAi(env({ ANTHROPIC_API_KEY: "ak-test" }), false),
    ).toBe(false);
  });
});
