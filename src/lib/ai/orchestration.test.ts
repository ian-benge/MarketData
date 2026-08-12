import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Env } from "@/lib/env";
import { AiOrchestration } from "@/lib/ai/orchestration";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { HeadlineClassificationSchema } from "@/lib/ai/schemas";
import { PROMPT_VERSIONS } from "@/lib/ai/prompt-versions";

const baseEnv = {
  NODE_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ALLOW_MOCK_PROVIDERS: true,
  DEMO_MODE: false,
  OPENAI_MODEL: "gpt-test",
  ANTHROPIC_MODEL: "claude-test",
  GEMINI_MODEL: "gemini-test",
  AI_DEFAULT_PROVIDER: "openai",
  STORAGE_BUCKET: "reports",
} as Env;

const SimpleSchema = z.object({
  labels: z.array(z.string()).min(1),
  confidence: z.number(),
});

function makeProvider(
  name: string,
  impl: (
    request: AiStructuredRequest<unknown>,
  ) => Promise<AiResult<unknown>> | AiResult<unknown>,
): AiProvider {
  return {
    async generateStructured<T>(
      request: AiStructuredRequest<T>,
    ): Promise<AiResult<T>> {
      const result = await impl(request as AiStructuredRequest<unknown>);
      return result as AiResult<T>;
    },
  };
}

describe("AiOrchestration", () => {
  it("falls back to the next provider when the primary fails", async () => {
    const primary = makeProvider("openai", async () => {
      throw new Error("primary down");
    });
    const secondary = makeProvider("anthropic", async (request) => {
      const data = request.schema.parse({
        labels: ["earnings"],
        confidence: 0.9,
      });
      return {
        data,
        providerName: "anthropic",
        model: "claude-test",
        promptVersion: PROMPT_VERSIONS.headline_classification,
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 12,
      };
    });

    const orch = new AiOrchestration({
      useMock: false,
      env: baseEnv,
      providers: {
        openai: primary,
        anthropic: secondary,
        gemini: makeProvider("gemini", async () => {
          throw new Error("should not reach");
        }),
      },
      defaultProvider: "openai",
      fallbackOrder: ["anthropic", "gemini"],
      maxAttemptsPerProvider: 1,
      timeoutMs: 5_000,
    });

    const result = await orch.generateStructured({
      task: "headline_classification",
      userPrompt: "Classify: NVDA beats earnings",
      schema: SimpleSchema,
    });

    expect(result.providerName).toBe("anthropic");
    expect(result.data.labels).toEqual(["earnings"]);
    expect(result.usageEvents.some((e) => !e.ok)).toBe(true);
    expect(result.usageEvents.some((e) => e.ok && e.fallbackUsed)).toBe(true);
  });

  it("rejects responses that fail Zod schema validation", async () => {
    const bad = makeProvider("openai", async () => ({
      data: { labels: [], confidence: 2 },
      providerName: "openai",
      model: "gpt-test",
      latencyMs: 5,
    }));

    const orch = new AiOrchestration({
      useMock: false,
      env: baseEnv,
      providers: { openai: bad },
      defaultProvider: "openai",
      fallbackOrder: [],
      maxAttemptsPerProvider: 1,
      timeoutMs: 5_000,
    });

    await expect(
      orch.generateStructured({
        task: "headline_classification",
        userPrompt: "bad",
        schema: HeadlineClassificationSchema,
      }),
    ).rejects.toThrow(/AiOrchestration failed/);
  });

  it("retries the same provider before falling back", async () => {
    let calls = 0;
    const flaky = makeProvider("openai", async (request) => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
      return {
        data: request.schema.parse({
          labels: ["macro"],
          confidence: 0.7,
        }),
        providerName: "openai",
        model: "gpt-test",
        latencyMs: 3,
      };
    });

    const orch = new AiOrchestration({
      useMock: false,
      env: baseEnv,
      providers: { openai: flaky },
      defaultProvider: "openai",
      fallbackOrder: [],
      maxAttemptsPerProvider: 2,
      retryDelayMs: 1,
      timeoutMs: 5_000,
    });

    const result = await orch.generateStructured({
      task: "headline_classification",
      userPrompt: "CPI print",
      schema: SimpleSchema,
    });

    expect(calls).toBe(2);
    expect(result.data.labels).toEqual(["macro"]);
    expect(result.usageEvents).toHaveLength(2);
  });

  it("times out slow providers", async () => {
    const slow = makeProvider(
      "openai",
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const orch = new AiOrchestration({
      useMock: false,
      env: baseEnv,
      providers: { openai: slow },
      defaultProvider: "openai",
      fallbackOrder: [],
      maxAttemptsPerProvider: 1,
      timeoutMs: 40,
    });

    await expect(
      orch.generateStructured({
        task: "headline_classification",
        userPrompt: "slow",
        schema: SimpleSchema,
      }),
    ).rejects.toThrow(/timed out|AiOrchestration failed/);
  });
});
