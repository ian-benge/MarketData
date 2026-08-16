import { createHash } from "node:crypto";
import type { z } from "zod";
import { AiOrchestration } from "@/lib/ai/orchestration";
import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { fixturesEnabled } from "@/lib/api/http";
import type { AiStructuredRequest } from "@/lib/providers/types";
import { evidenceHash, modelEvidenceView } from "./evidence";
import {
  groundAskAnswer,
  groundBookRisk,
  groundMoveNarrative,
  groundNewsDigest,
  groundQueryInterpret,
  groundSessionBrief,
} from "./grounding";
import {
  compileAskAnswer,
  compileBookRisk,
  compileMoveNarrative,
  compileNewsDigest,
  compileSessionBrief,
} from "./compile";
import {
  deskIntelEnabled,
  fastGatewayModel,
  gatewayConfigured,
  hasAnyAiCredentials,
  strongGatewayModel,
} from "./models";
import {
  ASK_INSTRUCTIONS,
  BOOK_RISK_INSTRUCTIONS,
  DESK_INTEL_PROMPT_VERSIONS,
  GROUNDED_SYSTEM,
  MOVE_NARRATIVE_INSTRUCTIONS,
  NEWS_DIGEST_INSTRUCTIONS,
  QUERY_PARSE_INSTRUCTIONS,
  SESSION_BRIEF_INSTRUCTIONS,
} from "./prompts";
import { sanitizeQuestion, wrapEvidenceBlock, looksLikeInjection } from "./sanitize";
import {
  AskAnswerSchema,
  BookRiskSchema,
  MoveNarrativeSchema,
  NewsDigestSchema,
  QueryInterpretSchema,
  SessionBriefSchema,
} from "./schemas";
import type {
  AskAnswer,
  BookRisk,
  DeskIntelEnvelope,
  DeskIntelKind,
  DeskIntelWarning,
  EvidencePack,
  GenerationMethod,
  MoveNarrative,
  NewsDigest,
  QueryInterpret,
  SessionBrief,
} from "./types";

export type GenerateOptions = {
  env?: Env;
  orchestration?: AiOrchestration;
  forceModel?: boolean;
  forceRefresh?: boolean;
  /** Compile only — paint immediately. Do not call the model. */
  rulesOnly?: boolean;
  pack?: EvidencePack;
  subject?: string;
};

function modelUsage(modeled: {
  inputTokens?: number;
  outputTokens?: number;
}) {
  return {
    inputTokens: modeled.inputTokens ?? null,
    outputTokens: modeled.outputTokens ?? null,
  };
}

function digestSubject(options: GenerateOptions): string {
  const subject = options.subject?.trim();
  return subject ? subject.slice(0, 80) : "digest";
}

const FAST_TASKS = new Set<DeskIntelKind>([
  "move_narrative",
  "news_digest",
  "query_parse",
]);

/** Skip overlay retries after a total provider failure (dashboard polls). */
const OVERLAY_COOLDOWN_MS = 45_000;
let overlayCooldownUntil = 0;

export function resetOverlayCooldown() {
  overlayCooldownUntil = 0;
}

function overlayCoolingDown(): boolean {
  return Date.now() < overlayCooldownUntil;
}

function markOverlayFailed() {
  overlayCooldownUntil = Date.now() + OVERLAY_COOLDOWN_MS;
}

function markOverlayOk() {
  overlayCooldownUntil = 0;
}

function shouldCallModel(env: Env, options: GenerateOptions): boolean {
  if (options.rulesOnly) return false;
  if (!deskIntelEnabled(env)) return false;
  if (options.forceModel) return true;
  if (env.NODE_ENV === "test") return false;
  if (fixturesEnabled() && !env.DESK_INTEL_IN_FIXTURES) return false;
  if (overlayCoolingDown()) return false;
  return hasAnyAiCredentials(env);
}

function promptFor(kind: DeskIntelKind): string {
  switch (kind) {
    case "session_brief":
      return SESSION_BRIEF_INSTRUCTIONS;
    case "move_narrative":
      return MOVE_NARRATIVE_INSTRUCTIONS;
    case "book_risk":
      return BOOK_RISK_INSTRUCTIONS;
    case "news_digest":
      return NEWS_DIGEST_INSTRUCTIONS;
    case "grounded_ask":
      return ASK_INSTRUCTIONS;
    case "query_parse":
      return QUERY_PARSE_INSTRUCTIONS;
  }
}

function envelope<T>(input: {
  kind: DeskIntelKind;
  subject: string;
  method: GenerationMethod;
  model: string | null;
  providerName: string | null;
  promptVersion: string;
  pack: EvidencePack;
  cached?: boolean;
  warnings: DeskIntelWarning[];
  data: T;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): DeskIntelEnvelope<T> {
  return {
    kind: input.kind,
    subject: input.subject,
    method: input.method,
    model: input.model,
    providerName: input.providerName,
    promptVersion: input.promptVersion,
    evidenceHash: evidenceHash(input.pack.identity),
    generatedAt: new Date().toISOString(),
    cached: input.cached ?? false,
    warnings: input.warnings,
    sources: input.pack.sources,
    data: input.data,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
  };
}

async function runModel<T>(input: {
  env: Env;
  kind: DeskIntelKind;
  schema: z.ZodType<T>;
  pack: EvidencePack;
  baseline: T;
  extraUser?: string;
  orchestration?: AiOrchestration;
}): Promise<{
  data: T;
  model: string;
  providerName: string;
  inputTokens?: number;
  outputTokens?: number;
} | null> {
  const orch =
    input.orchestration ??
    new AiOrchestration({
      env: input.env,
      useMock: input.env.NODE_ENV === "test",
      timeoutMs: 15_000,
      maxAttemptsPerProvider: 1,
    });
  const model = gatewayConfigured(input.env)
    ? FAST_TASKS.has(input.kind)
      ? fastGatewayModel(input.env)
      : strongGatewayModel(input.env)
    : undefined;
  const userPrompt = [
    promptFor(input.kind),
    input.extraUser ? `QUESTION:\n${sanitizeQuestion(input.extraUser)}` : "",
    "DETERMINISTIC_BASELINE_JSON:",
    JSON.stringify(input.baseline),
    wrapEvidenceBlock(modelEvidenceView(input.pack)),
  ]
    .filter(Boolean)
    .join("\n\n");
  const request: AiStructuredRequest<T> = {
    task: input.kind,
    systemPrompt: GROUNDED_SYSTEM,
    userPrompt,
    schema: input.schema,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS[input.kind],
    temperature: 0.1,
    maxTokens: FAST_TASKS.has(input.kind) ? 1_800 : 3_200,
    model,
    fixture: input.baseline,
  };
  try {
    const result = await orch.generateStructured(request);
    const usage = result.usageEvents.find((event) => event.ok);
    markOverlayOk();
    return {
      data: result.data,
      model: result.model,
      providerName: result.providerName,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    };
  } catch (error) {
    markOverlayFailed();
    console.error(`[desk-intel] ${input.kind} model failed`, error);
    return null;
  }
}

export async function generateSessionBrief(
  pack: EvidencePack,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<SessionBrief>> {
  const env = options.env ?? getEnv();
  const rules = compileSessionBrief(pack);
  const warnings: DeskIntelWarning[] = [];
  if (!shouldCallModel(env, options)) {
    return envelope({
      kind: "session_brief",
      subject: "session",
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.session_brief,
      pack,
      warnings,
      data: rules,
    });
  }
  const modeled = await runModel({
    env,
    kind: "session_brief",
    schema: SessionBriefSchema,
    pack,
    baseline: rules,
    orchestration: options.orchestration,
  });
  if (!modeled) {
    warnings.push({
      code: "model_unavailable",
      message: "Model synthesis failed; showing the rules compilation.",
    });
    return envelope({
      kind: "session_brief",
      subject: "session",
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.session_brief,
      pack,
      warnings,
      data: rules,
    });
  }
  const grounded = groundSessionBrief(modeled.data, pack);
  warnings.push(...grounded.warnings);
  if (grounded.rejected) {
    warnings.push({
      code: "grounding_rejected",
      message: "Model brief failed grounding; showing the rules compilation.",
    });
    return envelope({
      kind: "session_brief",
      subject: "session",
      method: "rules",
      model: modeled.model,
      providerName: modeled.providerName,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.session_brief,
      pack,
      warnings,
      data: rules,
    });
  }
  return envelope({
    kind: "session_brief",
    subject: "session",
    method: "model",
    model: modeled.model,
    providerName: modeled.providerName,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.session_brief,
    pack,
    warnings,
    data: grounded.data,
    ...modelUsage(modeled),
  });
}

export async function generateMoveNarrative(
  pack: EvidencePack,
  ticker: string,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<MoveNarrative>> {
  const env = options.env ?? getEnv();
  const symbol = ticker.toUpperCase();
  const rules = compileMoveNarrative(pack, symbol);
  const warnings: DeskIntelWarning[] = [];
  if (!shouldCallModel(env, options) || rules.attribution === "unknown") {
    if (rules.attribution === "unknown" && shouldCallModel(env, options)) {
      warnings.push({
        code: "unknown_not_narrated",
        message: "Unknown attribution is not sent to the model for a causal story.",
      });
    }
    return envelope({
      kind: "move_narrative",
      subject: symbol,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.move_narrative,
      pack,
      warnings,
      data: rules,
    });
  }
  const modeled = await runModel({
    env,
    kind: "move_narrative",
    schema: MoveNarrativeSchema,
    pack,
    baseline: rules,
    extraUser: `Ticker: ${symbol}`,
    orchestration: options.orchestration,
  });
  if (!modeled) {
    warnings.push({
      code: "model_unavailable",
      message: "Model synthesis failed; showing the rules compilation.",
    });
    return envelope({
      kind: "move_narrative",
      subject: symbol,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.move_narrative,
      pack,
      warnings,
      data: rules,
    });
  }
  const grounded = groundMoveNarrative(modeled.data, pack);
  warnings.push(...grounded.warnings);
  if (grounded.rejected) {
    return envelope({
      kind: "move_narrative",
      subject: symbol,
      method: "rules",
      model: modeled.model,
      providerName: modeled.providerName,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.move_narrative,
      pack,
      warnings: [
        ...warnings,
        {
          code: "grounding_rejected",
          message: "Model narrative failed grounding; showing the rules compilation.",
        },
      ],
      data: rules,
      ...modelUsage(modeled),
    });
  }
  return envelope({
    kind: "move_narrative",
    subject: symbol,
    method: "model",
    model: modeled.model,
    providerName: modeled.providerName,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.move_narrative,
    pack,
    warnings,
    data: grounded.data,
    ...modelUsage(modeled),
  });
}

export async function generateBookRisk(
  pack: EvidencePack,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<BookRisk>> {
  const env = options.env ?? getEnv();
  const rules = compileBookRisk(pack);
  const warnings: DeskIntelWarning[] = [];
  if (!shouldCallModel(env, options)) {
    return envelope({
      kind: "book_risk",
      subject: "book",
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.book_risk,
      pack,
      warnings,
      data: rules,
    });
  }
  const modeled = await runModel({
    env,
    kind: "book_risk",
    schema: BookRiskSchema,
    pack,
    baseline: rules,
    orchestration: options.orchestration,
  });
  if (!modeled) {
    warnings.push({
      code: "model_unavailable",
      message: "Model synthesis failed; showing the rules compilation.",
    });
    return envelope({
      kind: "book_risk",
      subject: "book",
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.book_risk,
      pack,
      warnings,
      data: rules,
    });
  }
  const grounded = groundBookRisk(modeled.data, pack);
  warnings.push(...grounded.warnings);
  const data = grounded.rejected ? rules : grounded.data;
  return envelope({
    kind: "book_risk",
    subject: "book",
    method: grounded.rejected ? "rules" : "model",
    model: modeled.model,
    providerName: modeled.providerName,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.book_risk,
    pack,
    warnings,
    data,
    ...modelUsage(modeled),
  });
}

export async function generateNewsDigest(
  pack: EvidencePack,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<NewsDigest>> {
  const env = options.env ?? getEnv();
  const rules = compileNewsDigest(pack);
  const warnings: DeskIntelWarning[] = [];
  const subject = digestSubject(options);
  if (!shouldCallModel(env, options)) {
    return envelope({
      kind: "news_digest",
      subject,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.news_digest,
      pack,
      warnings,
      data: rules,
    });
  }
  const modeled = await runModel({
    env,
    kind: "news_digest",
    schema: NewsDigestSchema,
    pack,
    baseline: rules,
    orchestration: options.orchestration,
  });
  if (!modeled) {
    warnings.push({
      code: "model_unavailable",
      message: "Model synthesis failed; showing the rules compilation.",
    });
    return envelope({
      kind: "news_digest",
      subject,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.news_digest,
      pack,
      warnings,
      data: rules,
    });
  }
  const grounded = groundNewsDigest(modeled.data, pack);
  warnings.push(...grounded.warnings);
  return envelope({
    kind: "news_digest",
    subject,
    method: grounded.rejected ? "rules" : "model",
    model: modeled.model,
    providerName: modeled.providerName,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.news_digest,
    pack,
    warnings,
    data: grounded.rejected ? rules : grounded.data,
    ...modelUsage(modeled),
  });
}

export async function generateAskAnswer(
  pack: EvidencePack,
  question: string,
  options: GenerateOptions = {},
): Promise<DeskIntelEnvelope<AskAnswer>> {
  const env = options.env ?? getEnv();
  const clean = sanitizeQuestion(question);
  const rules = compileAskAnswer(pack, clean);
  const warnings: DeskIntelWarning[] = [];
  const subject = createHash("sha256").update(clean.toLowerCase()).digest("hex").slice(0, 16);
  if (!shouldCallModel(env, options) || looksLikeInjection(clean)) {
    if (looksLikeInjection(clean)) {
      warnings.push({
        code: "prompt_injection_blocked",
        message: "Instruction-like input was not sent to the model.",
      });
    }
    return envelope({
      kind: "grounded_ask",
      subject,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.grounded_ask,
      pack,
      warnings,
      data: rules,
    });
  }
  const modeled = await runModel({
    env,
    kind: "grounded_ask",
    schema: AskAnswerSchema,
    pack,
    baseline: rules,
    extraUser: clean,
    orchestration: options.orchestration,
  });
  if (!modeled) {
    warnings.push({
      code: "model_unavailable",
      message: "Model synthesis failed; showing the evidence retrieval.",
    });
    return envelope({
      kind: "grounded_ask",
      subject,
      method: "rules",
      model: null,
      providerName: null,
      promptVersion: DESK_INTEL_PROMPT_VERSIONS.grounded_ask,
      pack,
      warnings,
      data: rules,
    });
  }
  const grounded = groundAskAnswer(modeled.data, pack);
  warnings.push(...grounded.warnings);
  return envelope({
    kind: "grounded_ask",
    subject,
    method: grounded.rejected ? "rules" : "model",
    model: modeled.model,
    providerName: modeled.providerName,
    promptVersion: DESK_INTEL_PROMPT_VERSIONS.grounded_ask,
    pack,
    warnings,
    data: grounded.rejected ? rules : grounded.data,
    ...modelUsage(modeled),
  });
}

export async function generateQueryInterpret(
  pack: EvidencePack,
  query: string,
  options: GenerateOptions = {},
): Promise<QueryInterpret | null> {
  const env = options.env ?? getEnv();
  if (looksLikeInjection(query)) return null;
  if (!shouldCallModel(env, options)) return null;
  const modeled = await runModel({
    env,
    kind: "query_parse",
    schema: QueryInterpretSchema,
    pack,
    baseline: {
      intent: "search",
      tickers: [],
      eventTypes: [],
      themes: [],
      materialOnly: false,
      timeWindow: null,
      textTerms: [],
      whyTicker: null,
    },
    extraUser: query,
    orchestration: options.orchestration,
  });
  return modeled ? groundQueryInterpret(modeled.data, pack) : null;
}
