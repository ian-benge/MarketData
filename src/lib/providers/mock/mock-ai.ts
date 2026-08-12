import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { assertMockProvidersAllowed } from "./assert-mock";

function extractJsonPayload(text: string): unknown | undefined {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as unknown;
    } catch {
      /* continue */
    }
  }
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare?.[0]) {
    try {
      return JSON.parse(bare[0]) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const TASK_FIXTURES: Record<string, unknown> = {
  headline_classification: {
    labels: ["earnings", "ai"],
    confidence: 0.82,
    tickers: ["NVDA"],
  },
  "headline-classify": {
    labels: ["earnings", "ai"],
    confidence: 0.82,
    tickers: ["NVDA"],
  },
  event_clustering: {
    clusters: [
      {
        clusterId: "cluster-demo-1",
        title: "DEMO: AI demand outlook",
        summary: "DEMO cluster from mock fixtures.",
        sourceIds: ["mock-news-1"],
        tickers: ["NVDA"],
        labels: ["ai"],
      },
    ],
  },
  causal_synthesis: {
    causalStatus: "reported",
    summary: "DEMO: Move attributed to reported earnings beat.",
    sourceIds: ["mock-news-1"],
    claims: [
      {
        id: "claim-demo-1",
        text: "DEMO: NVDA raised data-center outlook.",
        material: true,
        causalStatus: "reported",
        sourceIds: ["mock-news-1"],
        tickers: ["NVDA"],
      },
    ],
    unresolvedQuestions: [],
  },
  "causal-synthesis": {
    causalStatus: "reported",
    summary: "DEMO: Move attributed to reported earnings beat.",
    sourceIds: ["mock-news-1"],
  },
  section_drafting: {
    sections: [
      {
        sectionKey: "what_is_moving",
        title: "What is moving the market",
        body: "DEMO narrative — fixtures only.",
        claimIds: ["claim-demo-1"],
        sourceIds: ["mock-news-1"],
        labels: ["ai"],
      },
    ],
  },
  "section-draft": {
    title: "What is moving the market",
    body: "DEMO narrative — fixtures only.",
    claimIds: [],
  },
  editorial_pass: {
    revisedBullets: ["DEMO: Markets firmer on AI demand signals."],
    sectionEdits: [],
    flags: [],
  },
  prior_edition_audit: {
    notes: ["DEMO: prior theses preserved."],
    preservedThesisIds: [],
  },
};

/**
 * Deterministic mock AI — never calls the network.
 * Prefers request.fixture, then JSON in userPrompt, then task defaults.
 */
export class MockAiProvider implements AiProvider {
  constructor() {
    assertMockProvidersAllowed("MockAiProvider");
  }

  async generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const candidate =
      request.fixture ??
      extractJsonPayload(request.userPrompt) ??
      TASK_FIXTURES[request.task] ??
      {};

    const data = request.schema.parse(candidate);
    return {
      data,
      providerName: "mock-ai",
      model: request.model ?? "mock-deterministic",
      promptVersion: request.promptVersion ?? "mock-v1",
      usage: {
        inputTokens: Math.max(1, Math.ceil(request.userPrompt.length / 4)),
        outputTokens: 64,
      },
      latencyMs: Math.max(1, Date.now() - started),
    };
  }
}
