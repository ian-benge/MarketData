import { z } from "zod";
import { canonicalJson, sha256Json } from "./util";
import {
  isEvidenceFresh,
  type EvidenceMeta,
  type ProvenanceManifest,
} from "./evidence";

export const EVAL_DIMENSIONS = [
  "product_usefulness",
  "feature_depth",
  "ui_ux",
  "visual_hierarchy",
  "information_density",
  "responsive_behavior",
  "accessibility",
  "keyboard_workflow",
  "data_freshness_provenance",
  "calculations",
  "loading_degraded_states",
  "reliability",
  "performance",
  "security",
  "maintainability",
  "observability",
  "adjacent_consistency",
] as const;

export type EvalDimension = (typeof EVAL_DIMENSIONS)[number];

export const VAGUE_GATE_PATTERN =
  /\b(looks professional|works correctly|feels fast|is intuitive|looks fine|user-?friendly|clean ui|modern look|nice ux|polished enough|generally good)\b/i;

export const IMPLEMENTATION_PRESCRIPTIVE_PATTERN =
  /\bexport\s+(?:const|let|function|async|class|type|interface)\b|\bsrc\/[^\s]+?\.(?:ts|tsx|js|jsx)\b|\b(?:e2e|scripts)\/[^\s]+?\.(?:ts|tsx)\b|\b[A-Z][A-Z0-9_]*_TTL_[A-Z0-9_]+\b|\b(?:isAppRoute|pathname\.startsWith)\s*\(/;

export function isImplementationPrescriptive(text: string): boolean {
  return IMPLEMENTATION_PRESCRIPTIVE_PATTERN.test(text);
}

export function splitImplementationPrescription(text: string): {
  kept: string;
  moved: string[];
} {
  const sentences = text.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  if (sentences.length <= 1) {
    return isImplementationPrescriptive(text)
      ? { kept: "", moved: [text.trim()] }
      : { kept: text.trim(), moved: [] };
  }
  const kept: string[] = [];
  const moved: string[] = [];
  for (const sentence of sentences) {
    if (isImplementationPrescriptive(sentence)) moved.push(sentence);
    else kept.push(sentence);
  }
  return { kept: kept.join(" ").trim(), moved };
}

export function normalizeAcceptanceGate<
  T extends {
    userOutcome: string;
    observable: string;
    repairContext: string;
    architectureConstraint?: boolean;
  },
>(gate: T): T {
  if (gate.architectureConstraint) return gate;
  const outcome = splitImplementationPrescription(gate.userOutcome);
  const observable = splitImplementationPrescription(gate.observable);
  const moved = [...outcome.moved, ...observable.moved];
  if (!moved.length) return gate;
  const userOutcome = outcome.kept || gate.userOutcome;
  const nextObservable = observable.kept || gate.observable;
  if (!outcome.kept && !observable.kept) return gate;
  return {
    ...gate,
    userOutcome,
    observable: nextObservable,
    repairContext: [gate.repairContext, ...moved].join(" ").trim(),
  };
}

export const VerdictSchema = z.enum(["pass", "fail", "not_applicable"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const GateClassificationSchema = z.enum(["required", "conditional"]);
export const FailureSeveritySchema = z.enum([
  "blocker",
  "severe",
  "warning",
  "info",
]);
export const VerificationMethodSchema = z.enum([
  "screenshot",
  "dom_query",
  "keyboard",
  "a11y",
  "network",
  "console",
  "performance",
  "test",
  "code_inspect",
  "calculation_sample",
  "bundle",
  "landmarks",
  "repeat_timing",
]);

export const IdTextSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  actor: z.enum(["member", "admin", "public", "owner"]).default("member"),
  steps: z.array(z.string().min(1)).min(1),
  success: z.string().min(1),
});

export const TestableBehaviorSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  howToVerify: z.string().min(1),
  required: z.boolean().default(true),
});

export const DataCorrectnessSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  sourceOfTruth: z.string().min(1),
  required: z.boolean().default(true),
  sampleOrFormula: z.string().min(1).optional(),
});

export const BinaryExpectedSchema = z.object({
  kind: z.literal("binary"),
  result: z.boolean(),
});

export const ThresholdExpectedSchema = z.object({
  kind: z.literal("threshold"),
  metric: z.string().min(1),
  op: z.enum(["<=", ">=", "<", ">", "=="]),
  value: z.number(),
  unit: z.string().min(1),
  tolerance: z.number().nonnegative().optional(),
});

export const ExpectedResultSchema = z.discriminatedUnion("kind", [
  BinaryExpectedSchema,
  ThresholdExpectedSchema,
]);

function rejectVague(value: string, ctx: z.RefinementCtx, path: string) {
  if (VAGUE_GATE_PATTERN.test(value)) {
    ctx.addIssue({
      code: "custom",
      message: `${path} is not executable (vague UX language is forbidden). Translate it into an observable measurement or binary DOM/network/test result.`,
    });
  }
}

export const AcceptanceGateSchema = z
  .object({
    id: z
      .string()
      .min(2)
      .max(80)
      .regex(
        /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/,
        "gate id must be a stable lowercase slug",
      ),
    dimension: z.enum(EVAL_DIMENSIONS),
    classification: GateClassificationSchema,
    userOutcome: z.string().min(12),
    observable: z.string().min(16),
    verificationMethod: VerificationMethodSchema,
    evidenceArtifact: z.string().min(1),
    expected: ExpectedResultSchema,
    baselineValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).default(null),
    failureSeverity: FailureSeveritySchema,
    repairContext: z.string().min(12),
    activationCondition: z.string().min(8).optional(),
    architectureConstraint: z.boolean().optional(),
  })
  .superRefine((gate, ctx) => {
    rejectVague(gate.userOutcome, ctx, "userOutcome");
    rejectVague(gate.observable, ctx, "observable");
    rejectVague(gate.repairContext, ctx, "repairContext");
    if (!gate.architectureConstraint) {
      if (isImplementationPrescriptive(gate.userOutcome)) {
        ctx.addIssue({
          code: "custom",
          message:
            "userOutcome must describe an observable user-facing outcome, not an implementation instruction. Put file/export/function details in repairContext.",
          path: ["userOutcome"],
        });
      }
      if (isImplementationPrescriptive(gate.observable)) {
        ctx.addIssue({
          code: "custom",
          message:
            "observable must be a measurable user-facing result or evidence check, not an implementation prescription. Put file/export/function details in repairContext unless architectureConstraint is true.",
          path: ["observable"],
        });
      }
    }
    if (gate.classification === "conditional" && !gate.activationCondition) {
      ctx.addIssue({
        code: "custom",
        message: "conditional gates require activationCondition",
        path: ["activationCondition"],
      });
    }
    if (gate.classification === "required" && gate.activationCondition) {
      ctx.addIssue({
        code: "custom",
        message: "required gates must not set activationCondition",
        path: ["activationCondition"],
      });
    }
  });

export type AcceptanceGate = z.infer<typeof AcceptanceGateSchema>;

const PageContractObjectSchema = z
  .object({
    page: z.object({
      route: z.string().min(1),
      title: z.string().min(1),
      role: z.enum(["member", "admin", "public"]),
    }),
    objective: z.string().min(1),
    intendedOutcomes: z.array(z.string().min(1)).min(1),
    traderWorkflows: z.array(WorkflowSchema).min(1),
    implementationBoundaries: z.object({
      mayChange: z.array(z.string().min(1)).min(1),
      mustPreserve: z.array(z.string().min(1)).min(1),
      mustNot: z.array(z.string().min(1)).min(1),
    }),
    testableBehavior: z.array(TestableBehaviorSchema).min(1),
    performanceExpectations: z.object({
      measureBeforeChange: z.literal(true),
      preserveOrImprove: z.array(z.string().min(1)).min(1),
      repeatSamples: z.number().int().min(3).default(3),
      budgets: z
        .object({
          maxDocumentRequests: z.number().int().positive().optional(),
          maxTransferKb: z.number().positive().optional(),
          maxConsoleErrors: z.number().int().nonnegative().default(0),
          noDuplicatePolling: z.boolean().default(true),
          navigationMsMedianMax: z.number().positive().optional(),
          navigationMsVarianceMax: z.number().nonnegative().optional(),
        })
        .default({ maxConsoleErrors: 0, noDuplicatePolling: true }),
    }),
    dataCorrectness: z.array(DataCorrectnessSchema).min(1),
    acceptanceGates: z.array(AcceptanceGateSchema).min(EVAL_DIMENSIONS.length),
    shallowFeatureBan: z.object({
      noStubs: z.literal(true),
      noDisplayOnly: z.literal(true),
      noDisconnected: z.literal(true),
      noVisualOnlyWithoutBehavior: z.literal(true),
    }),
  })
  .superRefine((contract, ctx) => {
    const dims = new Set(contract.acceptanceGates.map((gate) => gate.dimension));
    const missing = EVAL_DIMENSIONS.filter((dimension) => !dims.has(dimension));
    if (missing.length) {
      ctx.addIssue({
        code: "custom",
        message: `missing acceptance gates for: ${missing.join(", ")}`,
        path: ["acceptanceGates"],
      });
    }
    const ids = contract.acceptanceGates.map((gate) => gate.id);
    const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (dup.length) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate gate ids: ${[...new Set(dup)].join(", ")}`,
        path: ["acceptanceGates"],
      });
    }
  });

export const PageContractSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const record = value as {
    acceptanceGates?: Array<{
      userOutcome: string;
      observable: string;
      repairContext: string;
      architectureConstraint?: boolean;
    }>;
  };
  if (!Array.isArray(record.acceptanceGates)) return value;
  return {
    ...record,
    acceptanceGates: record.acceptanceGates.map((gate) => normalizeAcceptanceGate(gate)),
  };
}, PageContractObjectSchema);

export type PageContract = z.infer<typeof PageContractObjectSchema>;

export const PageMapSchema = z.object({
  route: z.string().min(1),
  pageFile: z.string().min(1),
  relatedFiles: z.array(z.string().min(1)),
  dataFlow: z.array(z.string().min(1)),
  apis: z.array(z.string().min(1)),
  clientServerBoundary: z.string().min(1),
  existingTests: z.array(z.string()),
  adjacentPages: z.array(z.string()),
  designTokens: z.array(z.string()),
  sharedComponents: z.array(z.string()).default([]),
});

export type PageMap = z.infer<typeof PageMapSchema>;

export const BaselineSchema = z.object({
  route: z.string().min(1),
  summary: z.string().min(1),
  currentWorkflows: z.array(z.string().min(1)),
  strengths: z.array(z.string().min(1)),
  gaps: z.array(z.string().min(1)).min(1),
  performanceNotes: z.array(z.string().min(1)),
  dataProvenanceNotes: z.array(z.string().min(1)),
  testGaps: z.array(z.string()),
  doNotBreak: z.array(z.string().min(1)),
  loadingEmptyErrorNotes: z.array(z.string()).default([]),
});

export type Baseline = z.infer<typeof BaselineSchema>;

export const EvidenceRefSchema = z.object({
  kind: z.enum([
    "screenshot",
    "performance",
    "network",
    "console",
    "test",
    "code",
    "a11y",
    "keyboard",
    "landmarks",
    "bundle",
    "calculation",
    "other",
  ]),
  path: z.string().min(1),
  note: z.string().min(1),
  observation: z.string().min(1).optional(),
  measurement: z.number().optional(),
});

export const CriterionResultSchema = z.object({
  id: z.string().min(1),
  dimension: z.enum(EVAL_DIMENSIONS).optional(),
  verdict: VerdictSchema,
  evidence: z.array(EvidenceRefSchema).default([]),
  notes: z.string().min(1),
  activationConditionHeld: z.boolean().optional(),
});

export const EvaluationSchema = z.object({
  role: z.enum(["evaluator", "skeptic"]),
  contractHash: z.string().min(1),
  iteration: z.number().int().nonnegative(),
  summary: z.string().min(1),
  criteria: z.array(CriterionResultSchema).min(1),
  shallowOrDisconnected: z.array(z.string()).default([]),
  targetedRepair: z
    .array(
      z.object({
        criterionId: z.string().min(1),
        problem: z.string().min(1),
        evidence: z.array(EvidenceRefSchema).default([]),
        requestedFix: z.string().min(1),
      }),
    )
    .default([]),
  allRequiredPassed: z.boolean(),
  freshnessConfirmed: z.boolean().default(false),
});

export type Evaluation = z.infer<typeof EvaluationSchema>;

export const ContractDecisionSchema = z
  .object({
    decision: z.enum(["accept", "amend"]),
    acceptedHash: z.string().min(16).optional(),
    contract: PageContractSchema.optional(),
    amendments: z.array(z.string()).default([]),
    rationale: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "accept" && !value.acceptedHash) {
      ctx.addIssue({
        code: "custom",
        message: "accept requires acceptedHash of the canonical contract",
        path: ["acceptedHash"],
      });
    }
    if (value.decision === "amend" && !value.contract) {
      ctx.addIssue({
        code: "custom",
        message: "amend requires a complete replacement contract",
        path: ["contract"],
      });
    }
  });

export type ContractDecision = z.infer<typeof ContractDecisionSchema>;

export const FailedApproachSchema = z.object({
  iteration: z.number().int().nonnegative(),
  summary: z.string().min(1),
  whyItFailed: z.string().min(1),
  doNotRepeat: z.array(z.string().min(1)).default([]),
});

export const BuilderSummarySchema = z.object({
  iteration: z.number().int().nonnegative(),
  changedFiles: z.array(z.string()),
  behaviorImplemented: z.string().min(1),
  testsAdded: z.array(z.string()).default([]),
  testsRun: z.array(z.string()).default([]),
  architecturalDecisions: z.array(z.string()).default([]),
  abandonedApproaches: z.array(z.string()).default([]),
  remainingUncertainty: z.array(z.string()).default([]),
  contractDeviation: z.string().min(1).default("none"),
  whatChanged: z.string().min(1).optional(),
  whyBetter: z.string().min(1).optional(),
  deferred: z.array(z.string()).default([]),
  selfChecks: z.array(z.string()).default([]),
});

export type BuilderSummary = z.infer<typeof BuilderSummarySchema>;

export const ARTIFACT_SCHEMAS = {
  baseline: BaselineSchema,
  "page-map": PageMapSchema,
  contract: PageContractSchema,
  "contract-decision": ContractDecisionSchema,
  evaluation: EvaluationSchema,
  skeptic: EvaluationSchema,
  "failed-approach": FailedApproachSchema,
  "builder-summary": BuilderSummarySchema,
} as const;

export type ArtifactName = keyof typeof ARTIFACT_SCHEMAS;

export const ARTIFACT_NAME_LIST = Object.keys(ARTIFACT_SCHEMAS) as ArtifactName[];

export const MAX_ARTIFACT_BYTES = 512_000;

export function parseArtifact<K extends ArtifactName>(
  name: K,
  payload: unknown,
): z.infer<(typeof ARTIFACT_SCHEMAS)[K]> {
  const parsed = ARTIFACT_SCHEMAS[name].safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${name} artifact: ${issues}`);
  }
  return parsed.data as z.infer<(typeof ARTIFACT_SCHEMAS)[K]>;
}

export function requiredGates(contract: PageContract) {
  return contract.acceptanceGates.filter((gate) => gate.classification === "required");
}

export function conditionalGates(contract: PageContract) {
  return contract.acceptanceGates.filter(
    (gate) => gate.classification === "conditional",
  );
}

export type EvaluationCompleteness = {
  missing: string[];
  failed: string[];
  noEvidence: string[];
  illegalNotApplicable: string[];
  unprovenConditional: string[];
  ineligibleEvidence: string[];
};

export type GateEvidenceContext = {
  phase: "audit" | "post_edit";
  lockedContractHash: string;
  inspectMeta?: EvidenceMeta;
  provenance?: ProvenanceManifest | null;
  inspectFilePath?: string;
  requiredWorktreeSha?: string;
  runId?: string;
  route?: string;
  iteration?: number;
};

export function evaluationCompleteness(
  contract: PageContract,
  evaluation: Evaluation,
  evidence?: GateEvidenceContext,
): EvaluationCompleteness {
  const missing: string[] = [];
  const failed: string[] = [];
  const noEvidence: string[] = [];
  const illegalNotApplicable: string[] = [];
  const unprovenConditional: string[] = [];
  const ineligibleEvidence: string[] = [];

  const inspectEligible = evidence
    ? isEvidenceFresh({
        meta: evidence.inspectMeta,
        runId: evidence.runId ?? evidence.inspectMeta?.runId ?? "",
        route: evidence.route ?? evidence.inspectMeta?.route ?? "",
        contractHash: evidence.lockedContractHash,
        iteration: evidence.iteration ?? evidence.inspectMeta?.iteration ?? 0,
        requiredWorktreeSha: evidence.requiredWorktreeSha,
        provenance: evidence.provenance,
        inspectFilePath: evidence.inspectFilePath,
        phase: evidence.phase,
      })
    : { ok: true as const };

  for (const gate of contract.acceptanceGates) {
    const result = evaluation.criteria.find((row) => row.id === gate.id);
    if (!result) {
      missing.push(gate.id);
      continue;
    }
    if (result.verdict === "fail") failed.push(gate.id);
    if (gate.classification === "required" && result.verdict === "not_applicable") {
      illegalNotApplicable.push(gate.id);
    }
    if (
      gate.classification === "conditional" &&
      result.verdict === "not_applicable" &&
      result.activationConditionHeld !== false
    ) {
      unprovenConditional.push(gate.id);
    }
    if (result.verdict === "pass" && result.evidence.length === 0) {
      noEvidence.push(gate.id);
    }
    if (
      result.verdict === "not_applicable" &&
      gate.classification === "conditional" &&
      result.evidence.length === 0
    ) {
      noEvidence.push(gate.id);
    }
    if (result.verdict === "pass" && result.evidence.length > 0 && evidence && !inspectEligible.ok) {
      ineligibleEvidence.push(gate.id);
    }
  }
  return {
    missing,
    failed,
    noEvidence,
    illegalNotApplicable,
    unprovenConditional,
    ineligibleEvidence,
  };
}

export function evaluationHasStructuralFailure(
  completeness: EvaluationCompleteness,
): boolean {
  return (
    completeness.missing.length > 0 ||
    completeness.noEvidence.length > 0 ||
    completeness.illegalNotApplicable.length > 0 ||
    completeness.unprovenConditional.length > 0 ||
    completeness.ineligibleEvidence.length > 0
  );
}

export function scoreEvaluation(
  contract: PageContract,
  evaluation: Evaluation,
  completeness?: EvaluationCompleteness,
): number {
  const gates = requiredGates(contract);
  if (gates.length === 0) return 0;
  const ineligible = new Set(completeness?.ineligibleEvidence ?? []);
  let points = 0;
  for (const gate of gates) {
    const result = evaluation.criteria.find((row) => row.id === gate.id);
    if (!result) continue;
    if (ineligible.has(gate.id)) continue;
    if (result.verdict === "pass" && result.evidence.length > 0) points += 1;
  }
  return Math.round((points / gates.length) * 1000) / 10;
}

export function canonicalizeContract(contract: PageContract): {
  contract: PageContract;
  json: string;
  hash: string;
} {
  const parsed = PageContractSchema.parse({
    ...contract,
    acceptanceGates: contract.acceptanceGates.map((gate) => normalizeAcceptanceGate(gate)),
  });
  const json = canonicalJson(parsed);
  return {
    contract: JSON.parse(json) as PageContract,
    json,
    hash: sha256Json(parsed),
  };
}

export function prettyCanonicalContract(contract: PageContract): string {
  return `${JSON.stringify(canonicalizeContract(contract).contract, null, 2)}\n`;
}
