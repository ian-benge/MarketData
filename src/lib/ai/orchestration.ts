import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import type { AiProvider } from "@/lib/providers/interfaces";
import type { AiResult, AiStructuredRequest } from "@/lib/providers/types";
import { MockAiProvider } from "@/lib/providers/mock";
import { AnthropicProvider } from "@/lib/ai/anthropic-adapter";
import { GeminiProvider } from "@/lib/ai/gemini-adapter";
import { GatewayAiProvider } from "@/lib/ai/gateway-adapter";
import { gatewayConfigured } from "@/lib/desk-intel/models";
import {
  PROMPT_VERSIONS,
  type PromptTask,
  promptVersionFor,
} from "@/lib/ai/prompt-versions";

export type AiProviderId = "gateway" | "anthropic" | "gemini" | "mock";

export type AiUsageEvent = {
  providerName: string;
  model: string;
  purpose: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  ok: boolean;
  errorMessage?: string;
  attempt: number;
  fallbackUsed: boolean;
};

export type OrchestratedAiResult<T> = AiResult<T> & {
  usageEvents: AiUsageEvent[];
};

export type AiOrchestrationConfig = {
  env?: Env;
  /** Force mock path (tests / demo). Also auto when NODE_ENV=test. */
  useMock?: boolean;
  /** Injected provider instances keyed by id. */
  providers?: Partial<Record<AiProviderId, AiProvider>>;
  /** Override default provider for all tasks. */
  defaultProvider?: AiProviderId;
  /** Per-task preferred provider. */
  taskProviders?: Partial<Record<PromptTask, AiProviderId>>;
  /** Ordered fallbacks after the primary. */
  fallbackOrder?: AiProviderId[];
  maxAttemptsPerProvider?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const DEFAULT_FALLBACKS: AiProviderId[] = ["anthropic", "gemini"];

const TASK_PROVIDER_DEFAULTS: Record<PromptTask, AiProviderId> = {
  headline_classification: "gemini",
  event_clustering: "gemini",
  causal_synthesis: "anthropic",
  section_drafting: "anthropic",
  editorial_pass: "anthropic",
  prior_edition_audit: "anthropic",
  session_brief: "anthropic",
  move_narrative: "gemini",
  book_risk: "anthropic",
  news_digest: "gemini",
  grounded_ask: "anthropic",
  query_parse: "gemini",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`AI request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function envDefaultProvider(env: Env): AiProviderId {
  return env.AI_DEFAULT_PROVIDER;
}

function resolveProviderChain(
  task: string,
  config: AiOrchestrationConfig,
  env: Env,
): AiProviderId[] {
  if (config.useMock || env.NODE_ENV === "test") {
    return ["mock"];
  }

  const taskKey = task as PromptTask;
  const preferred =
    config.taskProviders?.[taskKey] ??
    config.defaultProvider ??
    TASK_PROVIDER_DEFAULTS[taskKey] ??
    envDefaultProvider(env);

  const fallbacks = (config.fallbackOrder ?? DEFAULT_FALLBACKS).filter(
    (id) => id !== preferred && id !== "mock",
  );

  const chain = [preferred, ...fallbacks];
  if (gatewayConfigured(env) && !chain.includes("gateway")) {
    return ["gateway", ...chain];
  }
  return chain;
}

function tryCreateProvider(id: AiProviderId, env: Env): AiProvider | null {
  try {
    switch (id) {
      case "gateway":
        if (!gatewayConfigured(env)) return null;
        return new GatewayAiProvider();
      case "anthropic":
        if (!env.ANTHROPIC_API_KEY) return null;
        return new AnthropicProvider({
          apiKey: env.ANTHROPIC_API_KEY,
          defaultModel: env.ANTHROPIC_MODEL,
        });
      case "gemini":
        if (!env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
        return new GeminiProvider({
          apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
          defaultModel: env.GEMINI_MODEL,
        });
      case "mock":
        return new MockAiProvider();
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Gateway ids are `provider/model`. Direct adapters reject those strings. */
export function requestModelForProvider(
  providerId: AiProviderId,
  requestModel?: string,
): string | undefined {
  if (!requestModel) return undefined;
  if (providerId === "gateway") return requestModel;
  if (requestModel.includes("/")) return undefined;
  return requestModel;
}

function modelFor(
  id: AiProviderId,
  env: Env,
  requestModel?: string,
): string {
  const scoped = requestModelForProvider(id, requestModel);
  if (scoped) return scoped;
  switch (id) {
    case "gateway":
      return env.DESK_INTEL_MODEL_STRONG;
    case "anthropic":
      return env.ANTHROPIC_MODEL;
    case "gemini":
      return env.GEMINI_MODEL;
    case "mock":
      return "mock-deterministic";
  }
}

/**
 * Provider-neutral AI service: task defaults, ordered fallbacks, retries + timeout.
 * Returns usage event metadata (does not persist to DB).
 */
export class AiOrchestration {
  private readonly config: Required<
    Pick<
      AiOrchestrationConfig,
      "maxAttemptsPerProvider" | "timeoutMs" | "retryDelayMs"
    >
  > &
    AiOrchestrationConfig;
  private readonly env: Env;
  private readonly providerCache = new Map<AiProviderId, AiProvider>();

  constructor(config: AiOrchestrationConfig = {}) {
    this.env = config.env ?? getEnv();
    this.config = {
      ...config,
      maxAttemptsPerProvider: config.maxAttemptsPerProvider ?? 2,
      timeoutMs: config.timeoutMs ?? 45_000,
      retryDelayMs: config.retryDelayMs ?? 250,
    };
  }

  getProvider(id: AiProviderId): AiProvider | null {
    const injected = this.config.providers?.[id];
    if (injected) return injected;

    const cached = this.providerCache.get(id);
    if (cached) return cached;

    const created = tryCreateProvider(id, this.env);
    if (created) this.providerCache.set(id, created);
    return created;
  }

  async generateStructured<T>(
    request: AiStructuredRequest<T>,
  ): Promise<OrchestratedAiResult<T>> {
    const chain = resolveProviderChain(request.task, this.config, this.env);
    const usageEvents: AiUsageEvent[] = [];
    const promptVersion =
      request.promptVersion ??
      promptVersionFor(request.task) ??
      PROMPT_VERSIONS.section_drafting;

    const enriched: AiStructuredRequest<T> = {
      ...request,
      promptVersion,
      temperature: request.temperature ?? 0.1,
    };

    let lastError: unknown;
    let providerIndex = 0;

    for (const providerId of chain) {
      const provider = this.getProvider(providerId);
      if (!provider) {
        usageEvents.push({
          providerName: providerId,
          model: modelFor(providerId, this.env, request.model),
          purpose: request.task,
          promptVersion,
          latencyMs: 0,
          ok: false,
          errorMessage: `Provider ${providerId} unavailable (missing credentials or disabled)`,
          attempt: 0,
          fallbackUsed: providerIndex > 0,
        });
        providerIndex += 1;
        continue;
      }

      const attempts = this.config.maxAttemptsPerProvider;
      const providerRequest: AiStructuredRequest<T> = {
        ...enriched,
        model: requestModelForProvider(providerId, request.model),
      };
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const attemptStarted = Date.now();
        try {
          const result = await withTimeout(
            provider.generateStructured(providerRequest),
            this.config.timeoutMs,
          );

          // Re-validate at orchestration boundary (defense in depth).
          const data = request.schema.parse(result.data);

          usageEvents.push({
            providerName: result.providerName,
            model: result.model,
            purpose: request.task,
            promptVersion: result.promptVersion ?? promptVersion,
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            latencyMs: result.latencyMs,
            ok: true,
            attempt,
            fallbackUsed: providerIndex > 0,
          });

          return {
            ...result,
            data,
            promptVersion: result.promptVersion ?? promptVersion,
            usageEvents,
          };
        } catch (err) {
          lastError = err;
          usageEvents.push({
            providerName: providerId,
            model: modelFor(providerId, this.env, request.model),
            purpose: request.task,
            promptVersion,
            latencyMs: Math.max(1, Date.now() - attemptStarted),
            ok: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            attempt,
            fallbackUsed: providerIndex > 0,
          });
          if (attempt < attempts) {
            await sleep(this.config.retryDelayMs * attempt);
          }
        }
      }
      providerIndex += 1;
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : `All AI providers failed for task "${request.task}"`;
    const error = new Error(`AiOrchestration failed: ${message}`);
    (error as Error & { usageEvents: AiUsageEvent[] }).usageEvents =
      usageEvents;
    throw error;
  }
}

export function createAiOrchestration(
  config?: AiOrchestrationConfig,
): AiOrchestration {
  return new AiOrchestration(config);
}
