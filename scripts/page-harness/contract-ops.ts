import {
  gatesNormativelyEqual,
  normativeContractHash,
  sortById,
  stringSetsEqual,
} from "./canonical";
import { sha256Json } from "./util";
import {
  canonicalizeContract,
  type AcceptanceGate,
  type ConstraintPath,
  type ContractDecision,
  type ContractOp,
  type PageContract,
} from "./schemas";

export type ContractReviewRole = "builder" | "evaluator";

export type GateDecisionKind = "accept" | "replace" | "remove" | "add" | "dispute" | "implicit";

export type GateVote = {
  role: ContractReviewRole;
  kind: GateDecisionKind;
  gate?: AcceptanceGate;
};

export type ConstraintVote = {
  role: ContractReviewRole;
  kind: "accept" | "replace" | "add" | "remove" | "dispute" | "implicit";
  value?: unknown;
};

export type UnresolvedGate = {
  kind: "gate";
  id: string;
  proposal: AcceptanceGate | null;
  votes: GateVote[];
};

export type UnresolvedConstraint = {
  kind: "constraint";
  path: ConstraintPath;
  proposal: unknown;
  votes: ConstraintVote[];
};

export type UnresolvedItem = UnresolvedGate | UnresolvedConstraint;

export type FrozenContractState = {
  contract: PageContract;
  hash: string;
  frozenGateIds: string[];
  frozenConstraints: ConstraintPath[];
  unresolved: UnresolvedItem[];
};

export type DisagreementManifest = {
  proposalHash: string;
  frozenHash: string;
  frozenGateIds: string[];
  frozenConstraints: ConstraintPath[];
  unresolved: UnresolvedItem[];
};

export class InvalidReviewDecisionError extends Error {
  readonly code = "INVALID_REVIEW_DECISION";
  constructor(
    readonly role: ContractReviewRole,
    message: string,
  ) {
    super(message);
    this.name = "InvalidReviewDecisionError";
  }
}

export class ContractExhaustedError extends Error {
  readonly code = "CONTRACT_EXHAUSTED";
  readonly category = "contract_exhausted" as const;
  constructor(
    readonly unresolved: UnresolvedItem[],
    readonly rounds: number,
  ) {
    super(
      `contract_exhausted: independent reviewers still disagree after ${rounds} round(s). Unresolved: ${summarizeUnresolved(unresolved)}. Refusing to BUILD.`,
    );
    this.name = "ContractExhaustedError";
  }
}

export function summarizeUnresolved(items: UnresolvedItem[]): string {
  if (!items.length) return "none";
  return items
    .map((item) => (item.kind === "gate" ? `gate:${item.id}` : `constraint:${item.path}`))
    .join(", ");
}

const CONSTRAINT_PATHS: ConstraintPath[] = [
  "page",
  "objective",
  "intendedOutcomes",
  "traderWorkflows",
  "implementationBoundaries.mayChange",
  "implementationBoundaries.mustPreserve",
  "implementationBoundaries.mustNot",
  "testableBehavior",
  "dataCorrectness",
  "performanceExpectations.preserveOrImprove",
  "performanceExpectations.budgets",
  "performanceExpectations.repeatSamples",
  "shallowFeatureBan",
];

export function constraintValue(contract: PageContract, path: ConstraintPath): unknown {
  switch (path) {
    case "page":
      return contract.page;
    case "objective":
      return contract.objective;
    case "intendedOutcomes":
      return contract.intendedOutcomes;
    case "traderWorkflows":
      return contract.traderWorkflows;
    case "implementationBoundaries.mayChange":
      return contract.implementationBoundaries.mayChange;
    case "implementationBoundaries.mustPreserve":
      return contract.implementationBoundaries.mustPreserve;
    case "implementationBoundaries.mustNot":
      return contract.implementationBoundaries.mustNot;
    case "testableBehavior":
      return contract.testableBehavior;
    case "dataCorrectness":
      return contract.dataCorrectness;
    case "performanceExpectations.preserveOrImprove":
      return contract.performanceExpectations.preserveOrImprove;
    case "performanceExpectations.budgets":
      return contract.performanceExpectations.budgets;
    case "performanceExpectations.repeatSamples":
      return contract.performanceExpectations.repeatSamples;
    case "shallowFeatureBan":
      return contract.shallowFeatureBan;
  }
}

export function setConstraintValue(
  contract: PageContract,
  path: ConstraintPath,
  value: unknown,
): PageContract {
  const next: PageContract = {
    ...contract,
    implementationBoundaries: { ...contract.implementationBoundaries },
    performanceExpectations: { ...contract.performanceExpectations },
  };
  switch (path) {
    case "page":
      next.page = value as PageContract["page"];
      break;
    case "objective":
      next.objective = String(value);
      break;
    case "intendedOutcomes":
      next.intendedOutcomes = value as string[];
      break;
    case "traderWorkflows":
      next.traderWorkflows = value as PageContract["traderWorkflows"];
      break;
    case "implementationBoundaries.mayChange":
      next.implementationBoundaries.mayChange = value as string[];
      break;
    case "implementationBoundaries.mustPreserve":
      next.implementationBoundaries.mustPreserve = value as string[];
      break;
    case "implementationBoundaries.mustNot":
      next.implementationBoundaries.mustNot = value as string[];
      break;
    case "testableBehavior":
      next.testableBehavior = value as PageContract["testableBehavior"];
      break;
    case "dataCorrectness":
      next.dataCorrectness = value as PageContract["dataCorrectness"];
      break;
    case "performanceExpectations.preserveOrImprove":
      next.performanceExpectations.preserveOrImprove = value as string[];
      break;
    case "performanceExpectations.budgets":
      next.performanceExpectations.budgets = value as PageContract["performanceExpectations"]["budgets"];
      break;
    case "performanceExpectations.repeatSamples":
      next.performanceExpectations.repeatSamples = Number(value);
      break;
    case "shallowFeatureBan":
      next.shallowFeatureBan = value as PageContract["shallowFeatureBan"];
      break;
  }
  return next;
}

function constraintsNormativelyEqual(path: ConstraintPath, a: unknown, b: unknown): boolean {
  if (path === "intendedOutcomes" || path.startsWith("implementationBoundaries.") || path === "performanceExpectations.preserveOrImprove") {
    if (!Array.isArray(a) || !Array.isArray(b)) return sha256Json(a) === sha256Json(b);
    if (a.every((item) => typeof item === "string") && b.every((item) => typeof item === "string")) {
      return stringSetsEqual(a as string[], b as string[]);
    }
  }
  if (path === "traderWorkflows" || path === "testableBehavior" || path === "dataCorrectness") {
    const left = Array.isArray(a) ? sortById(a as Array<{ id: string }>) : a;
    const right = Array.isArray(b) ? sortById(b as Array<{ id: string }>) : b;
    return sha256Json(left) === sha256Json(right);
  }
  return sha256Json(a) === sha256Json(b);
}

export function operationsFromReplacement(
  proposal: PageContract,
  replacement: PageContract,
): ContractOp[] {
  const ops: ContractOp[] = [];
  const proposed = new Map(proposal.acceptanceGates.map((gate) => [gate.id, gate]));
  const next = new Map(replacement.acceptanceGates.map((gate) => [gate.id, gate]));
  for (const [id, gate] of proposed) {
    const other = next.get(id);
    if (!other) {
      ops.push({ op: "remove_gate", id });
      continue;
    }
    if (!gatesNormativelyEqual(gate, other)) {
      ops.push({ op: "replace_gate", id, gate: other });
    }
  }
  for (const [id, gate] of next) {
    if (!proposed.has(id)) ops.push({ op: "add_gate", gate });
  }
  for (const path of CONSTRAINT_PATHS) {
    const left = constraintValue(proposal, path);
    const right = constraintValue(replacement, path);
    if (!constraintsNormativelyEqual(path, left, right)) {
      ops.push({ op: "replace_constraint", path, value: right });
    }
  }
  return ops;
}

export function normalizeReviewDecision(input: {
  decision: ContractDecision;
  role: ContractReviewRole;
  proposal: PageContract;
  proposalHash: string;
}): { ok: true; operations: ContractOp[]; acceptAll: boolean; rejectProposal: boolean } | { ok: false; reason: string } {
  const decision = input.decision;
  if (decision.proposalHash && decision.proposalHash !== input.proposalHash) {
    return {
      ok: true,
      operations: [],
      acceptAll: false,
      rejectProposal: true,
    };
  }
  if (decision.decision === "accept") {
    if (decision.acceptedHash !== input.proposalHash) {
      return { ok: true, operations: [], acceptAll: false, rejectProposal: true };
    }
    return { ok: true, operations: [{ op: "accept_all" }], acceptAll: true, rejectProposal: false };
  }
  if (decision.operations?.length) {
    const acceptAll = decision.operations.some((op) => op.op === "accept_all") && decision.operations.length === 1;
    return { ok: true, operations: decision.operations, acceptAll, rejectProposal: false };
  }
  if (decision.contract) {
    const canonical = canonicalizeContract(decision.contract);
    const ops = operationsFromReplacement(input.proposal, canonical.contract);
    if (ops.length === 0 || canonical.hash === input.proposalHash) {
      return { ok: true, operations: [{ op: "accept_all" }], acceptAll: true, rejectProposal: false };
    }
    return { ok: true, operations: ops, acceptAll: false, rejectProposal: false };
  }
  return { ok: false, reason: `${input.role} decision had no operations or replacement contract` };
}

function votesForGate(
  id: string,
  proposalGate: AcceptanceGate | undefined,
  byRole: Array<{
    role: ContractReviewRole;
    operations: ContractOp[];
    acceptAll: boolean;
    rejectProposal?: boolean;
  }>,
): GateVote[] {
  return byRole.map((row) => {
    if (row.rejectProposal) return { role: row.role, kind: "dispute", gate: proposalGate };
    if (row.acceptAll) return { role: row.role, kind: "accept", gate: proposalGate };
    const ops = row.operations.filter(
      (op) =>
        (op.op === "accept_gate" && op.id === id) ||
        (op.op === "replace_gate" && op.id === id) ||
        (op.op === "remove_gate" && op.id === id) ||
        (op.op === "dispute_gate" && op.id === id) ||
        (op.op === "add_gate" && op.gate.id === id),
    );
    if (!ops.length) {
      return { role: row.role, kind: proposalGate ? "implicit" : "implicit", gate: proposalGate };
    }
    const last = ops[ops.length - 1]!;
    if (last.op === "accept_gate") return { role: row.role, kind: "accept", gate: proposalGate };
    if (last.op === "replace_gate") return { role: row.role, kind: "replace", gate: last.gate };
    if (last.op === "add_gate") return { role: row.role, kind: "add", gate: last.gate };
    if (last.op === "remove_gate") return { role: row.role, kind: "remove" };
    if (last.op === "dispute_gate") return { role: row.role, kind: "dispute", gate: last.competing };
    return { role: row.role, kind: "implicit", gate: proposalGate };
  });
}

function votesForConstraint(
  path: ConstraintPath,
  proposalValue: unknown,
  byRole: Array<{
    role: ContractReviewRole;
    operations: ContractOp[];
    acceptAll: boolean;
    rejectProposal?: boolean;
  }>,
): ConstraintVote[] {
  return byRole.map((row) => {
    if (row.rejectProposal) return { role: row.role, kind: "dispute", value: proposalValue };
    if (row.acceptAll) return { role: row.role, kind: "accept", value: proposalValue };
    const ops = row.operations.filter(
      (op) =>
        (op.op === "accept_constraint" ||
          op.op === "replace_constraint" ||
          op.op === "add_constraint" ||
          op.op === "remove_constraint" ||
          op.op === "dispute_constraint") &&
        op.path === path,
    );
    if (!ops.length) return { role: row.role, kind: "implicit", value: proposalValue };
    const last = ops[ops.length - 1]!;
    if (last.op === "accept_constraint") return { role: row.role, kind: "accept", value: proposalValue };
    if (last.op === "replace_constraint" || last.op === "add_constraint") {
      return { role: row.role, kind: last.op === "add_constraint" ? "add" : "replace", value: last.value };
    }
    if (last.op === "remove_constraint") return { role: row.role, kind: "remove", value: last.value };
    if (last.op === "dispute_constraint") return { role: row.role, kind: "dispute", value: last.competing };
    return { role: row.role, kind: "implicit", value: proposalValue };
  });
}

function gateAgreement(votes: GateVote[]): { agreed: AcceptanceGate | null | "remove"; conflict: boolean } {
  const material = votes.map((vote) => {
    if (vote.kind === "accept" || vote.kind === "implicit") {
      return vote.gate ? { action: "keep" as const, gate: vote.gate } : { action: "absent" as const };
    }
    if (vote.kind === "remove") return { action: "remove" as const };
    if (vote.gate) return { action: "replace" as const, gate: vote.gate };
    return { action: "absent" as const };
  });
  if (material.every((row) => row.action === "keep" || row.action === "absent")) {
    const kept = material.find((row) => row.action === "keep");
    return { agreed: kept && "gate" in kept ? kept.gate : null, conflict: false };
  }
  if (material.every((row) => row.action === "remove")) {
    return { agreed: "remove", conflict: false };
  }
  const replacements = material.filter((row) => row.action === "replace" && "gate" in row);
  if (
    replacements.length === material.length &&
    replacements.every((row, _, all) => {
      const first = all[0];
      return row.action === "replace" && first?.action === "replace" && "gate" in row && "gate" in first
        ? gatesNormativelyEqual(row.gate, first.gate)
        : false;
    })
  ) {
    const first = replacements[0];
    return { agreed: first && "gate" in first ? first.gate : null, conflict: false };
  }
  const keepOrReplace = material.filter((row) => row.action === "keep" || row.action === "replace");
  if (
    keepOrReplace.length === material.length &&
    keepOrReplace.every((row) => {
      const first = keepOrReplace[0];
      if (!first || !("gate" in first) || !("gate" in row) || !first.gate || !row.gate) return false;
      return gatesNormativelyEqual(first.gate, row.gate);
    })
  ) {
    const first = keepOrReplace[0];
    return { agreed: first && "gate" in first ? first.gate ?? null : null, conflict: false };
  }
  return { agreed: null, conflict: true };
}

function constraintAgreement(
  path: ConstraintPath,
  proposalValue: unknown,
  votes: ConstraintVote[],
): { agreed: unknown | typeof REMOVE_CONSTRAINT; conflict: boolean } {
  const material = votes.map((vote) => {
    if (vote.kind === "accept" || vote.kind === "implicit") {
      return { action: "keep" as const, value: proposalValue };
    }
    if (vote.kind === "remove") return { action: "remove" as const, value: vote.value };
    return { action: "replace" as const, value: vote.value };
  });
  if (material.every((row) => row.action === "keep")) {
    return { agreed: proposalValue, conflict: false };
  }
  if (material.every((row) => row.action === "remove")) {
    return { agreed: REMOVE_CONSTRAINT, conflict: false };
  }
  if (
    material.every((row) => row.action === "replace") &&
    material.every((row) => constraintsNormativelyEqual(path, row.value, material[0]?.value))
  ) {
    return { agreed: material[0]?.value, conflict: false };
  }
  if (
    material.every((row) => row.action === "keep" || row.action === "replace") &&
    material.every((row) => constraintsNormativelyEqual(path, row.value, material[0]?.value))
  ) {
    return { agreed: material[0]?.value, conflict: false };
  }
  return { agreed: undefined, conflict: true };
}

const REMOVE_CONSTRAINT = Symbol("remove-constraint");

export function reconcileContractDecisions(input: {
  proposal: PageContract;
  proposalHash: string;
  reviews: Array<{ role: ContractReviewRole; decision: ContractDecision }>;
}): FrozenContractState {
  const normalized = input.reviews.map((row) => {
    const parsed = normalizeReviewDecision({
      decision: row.decision,
      role: row.role,
      proposal: input.proposal,
      proposalHash: input.proposalHash,
    });
    if (!parsed.ok) {
      throw new InvalidReviewDecisionError(row.role, parsed.reason);
    }
    return {
      role: row.role,
      operations: parsed.operations,
      acceptAll: parsed.acceptAll,
      rejectProposal: parsed.rejectProposal,
    };
  });

  let contract = input.proposal;
  const frozenGateIds: string[] = [];
  const unresolved: UnresolvedItem[] = [];
  const proposedIds = new Set(input.proposal.acceptanceGates.map((gate) => gate.id));
  const extraIds = new Set<string>();
  for (const row of normalized) {
    for (const op of row.operations) {
      if (op.op === "add_gate") extraIds.add(op.gate.id);
      if (op.op === "replace_gate" || op.op === "dispute_gate") extraIds.add(op.id);
    }
  }
  const allIds = [...new Set([...proposedIds, ...extraIds])];
  const gateMap = new Map(contract.acceptanceGates.map((gate) => [gate.id, gate]));

  for (const id of allIds) {
    const proposalGate = gateMap.get(id);
    const votes = votesForGate(id, proposalGate, normalized);
    const agreement = gateAgreement(votes);
    if (agreement.conflict) {
      unresolved.push({ kind: "gate", id, proposal: proposalGate ?? null, votes });
      continue;
    }
    frozenGateIds.push(id);
    if (agreement.agreed === "remove") {
      gateMap.delete(id);
      continue;
    }
    if (agreement.agreed) gateMap.set(id, agreement.agreed);
  }

  const frozenConstraints: ConstraintPath[] = [];
  for (const path of CONSTRAINT_PATHS) {
    const proposalValue = constraintValue(input.proposal, path);
    const votes = votesForConstraint(path, proposalValue, normalized);
    const agreement = constraintAgreement(path, proposalValue, votes);
    if (agreement.conflict) {
      unresolved.push({ kind: "constraint", path, proposal: proposalValue, votes });
      continue;
    }
    frozenConstraints.push(path);
    if (agreement.agreed === REMOVE_CONSTRAINT) continue;
    if (agreement.agreed !== undefined) {
      contract = setConstraintValue(contract, path, agreement.agreed);
    }
  }

  contract = {
    ...contract,
    acceptanceGates: [...gateMap.values()],
  };
  const canonical = canonicalizeContract(contract);
  return {
    contract: canonical.contract,
    hash: canonical.hash,
    frozenGateIds: [...new Set(frozenGateIds)].sort(),
    frozenConstraints,
    unresolved,
  };
}

export function disagreementManifest(
  proposalHash: string,
  state: FrozenContractState,
): DisagreementManifest {
  return {
    proposalHash,
    frozenHash: state.hash,
    frozenGateIds: state.frozenGateIds,
    frozenConstraints: state.frozenConstraints,
    unresolved: state.unresolved,
  };
}

export function applyFrozenGatesToPrompt(input: {
  contract: PageContract;
  frozenGateIds: string[];
  unresolved: UnresolvedItem[];
}): { accepted: AcceptanceGate[]; disputed: UnresolvedGate[] } {
  const frozen = new Set(input.frozenGateIds);
  return {
    accepted: input.contract.acceptanceGates.filter((gate) => frozen.has(gate.id)),
    disputed: input.unresolved.filter((item): item is UnresolvedGate => item.kind === "gate"),
  };
}

export function scopedContractForDispute(input: {
  contract: PageContract;
  unresolved: UnresolvedItem[];
}): {
  gates: AcceptanceGate[];
  constraints: Array<{ path: ConstraintPath; proposal: unknown }>;
} {
  const gateIds = new Set(
    input.unresolved.filter((item): item is UnresolvedGate => item.kind === "gate").map((item) => item.id),
  );
  return {
    gates: input.contract.acceptanceGates.filter((gate) => gateIds.has(gate.id)),
    constraints: input.unresolved
      .filter((item): item is UnresolvedConstraint => item.kind === "constraint")
      .map((item) => ({ path: item.path, proposal: item.proposal })),
  };
}

export function sameCanonicalHash(a: PageContract, b: PageContract): boolean {
  return canonicalizeContract(a).hash === canonicalizeContract(b).hash;
}

export function reviewerPromptOps(unresolved: UnresolvedItem[]): string {
  if (!unresolved.length) return "No unresolved items. Accept the proposal hash.";
  return unresolved
    .map((item) => {
      if (item.kind === "gate") {
        const votes = item.votes
          .map((vote) => `${vote.role}:${vote.kind}${vote.gate ? ` hash=${sha256Json({ id: vote.gate.id, observable: vote.gate.observable, userOutcome: vote.gate.userOutcome })}` : ""}`)
          .join("; ");
        return `- gate ${item.id}: ${votes}`;
      }
      const votes = item.votes.map((vote) => `${vote.role}:${vote.kind}`).join("; ");
      return `- constraint ${item.path}: ${votes}`;
    })
    .join("\n");
}
