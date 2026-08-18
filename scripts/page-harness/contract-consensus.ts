import type { AgentHost } from "./agents";
import { AgentInvocationError } from "./agents";
import type { ArtifactStore } from "./artifacts";
import type { RunBudget } from "./budget";
import {
  ContractExhaustedError,
  InvalidReviewDecisionError,
  disagreementManifest,
  normalizeReviewDecision,
  reconcileContractDecisions,
  type ContractReviewRole,
  type DisagreementManifest,
  type FrozenContractState,
  type UnresolvedItem,
} from "./contract-ops";
import { wrapUntrusted } from "./injection";
import { persistInvocationCompletion } from "./invocations";
import type { IsolatedWorkspace } from "./isolation";
import type { RunMachine } from "./machine";
import { contractReviewPrompt } from "./prompts";
import type { RouteContextBundle } from "./route-context";
import {
  canonicalizeContract,
  parseArtifact,
  type ContractDecision,
  type PageContract,
} from "./schemas";
import { nowIso } from "./util";
import type { Logger } from "./util";

export type ContractConsensusDeps = {
  host: AgentHost;
  store: ArtifactStore;
  isolation: IsolatedWorkspace;
  budget: RunBudget;
  log: Logger;
  machine?: RunMachine;
  persistBudget?: () => void;
  contextBundle?: RouteContextBundle | null;
};

export type ContractResume = {
  startRound: number;
  skipBuilder?: boolean;
  skipEvaluator?: boolean;
};

export type AgreeContractResult = {
  contract: PageContract;
  hash: string;
  rounds: number;
  disputeOnlyCalls: number;
  frozenGateIds: string[];
};

const REVIEW_ORDER: ContractReviewRole[] = ["builder", "evaluator"];

export async function agreeContract(options: {
  route: string;
  objective: string;
  contract: PageContract;
  maxRounds: number;
  independentReviewers?: 1 | 2;
  disputeReviewers?: 1 | 2;
  deps: ContractConsensusDeps;
  resume?: ContractResume;
}): Promise<AgreeContractResult> {
  let current = canonicalizeContract(options.contract);
  if (!options.deps.store.readJson("contract-proposal-0.json")) {
    options.deps.store.writeJson("contract-proposal-0.json", {
      hash: current.hash,
      contract: current.contract,
    });
  }
  const independentReviewers = options.independentReviewers ?? 2;
  const disputeReviewers = options.disputeReviewers ?? independentReviewers;
  const startRound = options.resume?.startRound ?? 1;
  let disputeOnlyCalls = 0;
  let frozenGateIds: string[] = readFrozenIds(options.deps.store);
  let unresolved: UnresolvedItem[] =
    (options.deps.store.readJson("contract-disagreement.json") as DisagreementManifest | null)
      ?.unresolved ?? [];

  recoverOrphanDecision(options.deps.store, options.deps.machine);

  for (let round = startRound; round <= options.maxRounds; round += 1) {
    const disputeOnly = round > 1 && unresolved.length > 0;
    const roles = rolesForRound({
      round,
      independentReviewers,
      disputeReviewers,
      disputeOnly,
      resume: round === startRound ? options.resume : undefined,
    });
    options.deps.store.writeJson(`contract-round-${round}-roles.json`, {
      roles,
      disputeOnly,
      proposalHash: current.hash,
    });

    const existing = loadRoundDecisions(options.deps.store, round);
    const needed = roles.filter((role) => !existing[role]);
    if (needed.length) {
      for (const role of needed) {
        const decision = await invokeReviewer({
          round,
          role,
          route: options.route,
          objective: options.objective,
          contractJson: JSON.stringify(current.contract, null, 2),
          contractHash: current.hash,
          deps: options.deps,
          frozenGateIds,
          unresolved: disputeOnly ? unresolved : [],
          disputeOnly,
          acceptedJson: disputeOnly
            ? JSON.stringify(
                {
                  frozenGateIds,
                  gates: current.contract.acceptanceGates.filter((gate) =>
                    frozenGateIds.includes(gate.id),
                  ),
                },
                null,
                2,
              )
            : undefined,
        });
        options.deps.store.writeJson(`contract-decision-${role}-${round}.json`, decision);
        if (disputeOnly) disputeOnlyCalls += 1;
        options.deps.budget.assertAfterInvocation();
      }
    }

    const builderDecision = parseOptionalDecision(
      options.deps.store.readJson(`contract-decision-builder-${round}.json`),
    );
    const evaluatorDecision = parseOptionalDecision(
      options.deps.store.readJson(`contract-decision-evaluator-${round}.json`),
    );

    const required = rolesForRound({
      round,
      independentReviewers,
      disputeReviewers,
      disputeOnly,
    });
    if (required.includes("builder") && !builderDecision) continue;
    if (required.includes("evaluator") && !evaluatorDecision) continue;
    if (independentReviewers === 1 && round === 1 && !builderDecision && !evaluatorDecision) {
      continue;
    }

    options.deps.machine?.markContractRoundComplete(round, current.hash);

    const reviews = [
      builderDecision ? { role: "builder" as const, decision: builderDecision } : null,
      evaluatorDecision ? { role: "evaluator" as const, decision: evaluatorDecision } : null,
    ].filter((row): row is { role: ContractReviewRole; decision: ContractDecision } => Boolean(row));

    let state: FrozenContractState;
    try {
      state = reconcileContractDecisions({
        proposal: current.contract,
        proposalHash: current.hash,
        reviews,
      });
    } catch (error) {
      if (error instanceof InvalidReviewDecisionError) {
        options.deps.log.warn(error.message);
        options.deps.store.writeJson(`contract-invalid-decision-${round}-${error.role}.json`, {
          role: error.role,
          reason: error.message,
        });
        options.deps.machine?.setIncompleteInvocation({
          round,
          role: error.role,
          purpose: "contract_reviewer",
          agentId: null,
          runId: null,
          startedAt: nowIso(),
          status: "failed",
          countedTowardBudget: true,
        });
        throw error;
      }
      throw error;
    }

    frozenGateIds = state.frozenGateIds;
    unresolved = state.unresolved;
    options.deps.store.writeJson("contract-frozen.json", {
      hash: state.hash,
      frozenGateIds,
      frozenConstraints: state.frozenConstraints,
      at: nowIso(),
    });

    if (!state.unresolved.length) {
      current = canonicalizeContract(state.contract);
      options.deps.store.writeJson("contract.json", current.contract);
      options.deps.store.writeJson("contract-agreement.json", {
        hash: current.hash,
        agreedAt: nowIso(),
        rounds: round,
        disputeOnlyCalls,
      });
      options.deps.log.info(`contract agreed hash=${current.hash.slice(0, 12)} rounds=${round}`);
      if (options.deps.machine) {
        options.deps.machine.state.canonicalProposalHash = current.hash;
        options.deps.machine.persist();
      }
      return {
        contract: current.contract,
        hash: current.hash,
        rounds: round,
        disputeOnlyCalls,
        frozenGateIds,
      };
    }

    const manifest = disagreementManifest(current.hash, state);
    options.deps.store.writeJson("contract-disagreement.json", manifest);
    options.deps.store.writeJson(`contract-conflict-${round}.json`, {
      unresolved: state.unresolved,
      frozenHash: state.hash,
      frozenGateIds,
      note: wrapUntrusted(
        "contract-disagreement",
        "Unresolved normative differences only. Frozen gates are not reopened. No full contract rewrite.",
      ),
    });
    current = canonicalizeContract(state.contract);
    options.deps.store.writeJson("contract.json", current.contract);
    options.deps.store.writeJson(`contract-proposal-${round}.json`, {
      hash: current.hash,
      contract: current.contract,
      disputeOnly: true,
      unresolvedIds: state.unresolved.map((item) =>
        item.kind === "gate" ? item.id : item.path,
      ),
    });
    if (options.deps.machine) {
      options.deps.machine.state.canonicalProposalHash = current.hash;
      options.deps.machine.persist();
    }
    options.deps.log.warn(
      `contract disagreement at round ${round}: ${state.unresolved.length} unresolved; frozen ${frozenGateIds.length} gates`,
    );
  }

  const manifest = options.deps.store.readJson("contract-disagreement.json") as
    | DisagreementManifest
    | null;
  throw new ContractExhaustedError(manifest?.unresolved ?? unresolved, options.maxRounds);
}

function rolesForRound(input: {
  round: number;
  independentReviewers: 1 | 2;
  disputeReviewers: 1 | 2;
  disputeOnly: boolean;
  resume?: ContractResume;
}): ContractReviewRole[] {
  const count = input.disputeOnly ? input.disputeReviewers : input.independentReviewers;
  let roles: ContractReviewRole[] =
    count === 1
      ? input.disputeOnly
        ? ["evaluator"]
        : ["builder"]
      : [...REVIEW_ORDER];
  if (input.resume?.skipBuilder) roles = roles.filter((role) => role !== "builder");
  if (input.resume?.skipEvaluator) roles = roles.filter((role) => role !== "evaluator");
  if (count === 1 && input.disputeOnly && input.resume?.skipEvaluator) {
    roles = ["builder"];
  }
  return roles;
}

function loadRoundDecisions(
  store: ArtifactStore,
  round: number,
): Partial<Record<ContractReviewRole, ContractDecision>> {
  const out: Partial<Record<ContractReviewRole, ContractDecision>> = {};
  const builder = store.readJson(`contract-decision-builder-${round}.json`);
  const evaluator = store.readJson(`contract-decision-evaluator-${round}.json`);
  if (builder) out.builder = parseArtifact("contract-decision", builder);
  if (evaluator) out.evaluator = parseArtifact("contract-decision", evaluator);
  return out;
}

function parseOptionalDecision(value: unknown): ContractDecision | null {
  if (!value || typeof value !== "object") return null;
  return parseArtifact("contract-decision", value);
}

function readFrozenIds(store: ArtifactStore): string[] {
  const frozen = store.readJson("contract-frozen.json") as { frozenGateIds?: string[] } | null;
  return frozen?.frozenGateIds ?? [];
}

function recoverOrphanDecision(store: ArtifactStore, machine?: RunMachine): void {
  const incomplete = machine?.state.incompleteInvocation;
  if (!incomplete) return;
  const pending = store.readJson("contract-decision.json");
  if (!pending) return;
  try {
    parseArtifact("contract-decision", pending);
  } catch {
    return;
  }
  const dest = `contract-decision-${incomplete.role}-${incomplete.round}.json`;
  if (store.readJson(dest)) return;
  store.writeJson(dest, pending);
  machine?.setIncompleteInvocation(null);
}

async function invokeReviewer(options: {
  round: number;
  role: ContractReviewRole;
  route: string;
  objective: string;
  contractJson: string;
  contractHash: string;
  deps: ContractConsensusDeps;
  frozenGateIds: string[];
  unresolved: UnresolvedItem[];
  disputeOnly: boolean;
  acceptedJson?: string;
}): Promise<ContractDecision> {
  const startedAt = nowIso();
  options.deps.machine?.setIncompleteInvocation({
    round: options.round,
    role: options.role,
    purpose: "contract_reviewer",
    agentId: null,
    runId: null,
    startedAt,
    status: "started",
    countedTowardBudget: true,
  });
  const reviewer = await options.deps.host.open({
    role: options.role,
    cwd: options.deps.isolation.agentCwd,
    purpose: "contract_reviewer",
  });
  options.deps.machine?.setIncompleteInvocation({
    round: options.round,
    role: options.role,
    purpose: "contract_reviewer",
    agentId: reviewer.agentId,
    runId: null,
    startedAt,
    status: "started",
    countedTowardBudget: true,
  });
  try {
    const turn = await reviewer.send(
      contractReviewPrompt({
        role: options.role,
        route: options.route,
        objective: options.objective,
        contractJson: options.contractJson,
        contractHash: options.contractHash,
        contextBundle: options.deps.contextBundle,
        frozenGateIds: options.frozenGateIds,
        unresolved: options.unresolved,
        acceptedJson: options.acceptedJson,
        disputeOnly: options.disputeOnly,
      }),
    );
    const decision = readDecision(options.deps.store);
    persistInvocationCompletion(options.deps.store, {
      status: "completed",
      role: options.role,
      purpose: "contract_reviewer",
      runId: turn.runId ?? null,
      agentId: reviewer.agentId,
      artifactName: `contract-decision-${options.role}-${options.round}.json`,
      artifact: decision,
      usage: turn.usageAccount ?? null,
      proposalHash: options.contractHash,
      phaseDecision: decision.decision,
    });
    options.deps.machine?.setIncompleteInvocation(null);
    options.deps.persistBudget?.();
    return decision;
  } catch (error) {
    const runId = error instanceof AgentInvocationError ? error.runId ?? null : null;
    const alreadyPersisted = Boolean(
      options.deps.store.readJson(`contract-decision-${options.role}-${options.round}.json`) ||
        options.deps.store.readJson("contract-decision.json"),
    );
    if (!alreadyPersisted) {
      options.deps.machine?.setIncompleteInvocation({
        round: options.round,
        role: options.role,
        purpose: "contract_reviewer",
        agentId: reviewer.agentId,
        runId,
        startedAt,
        status: "failed",
        countedTowardBudget: true,
      });
    } else {
      options.deps.machine?.setIncompleteInvocation(null);
    }
    options.deps.persistBudget?.();
    throw error;
  } finally {
    await reviewer.close();
  }
}

function readDecision(store: ArtifactStore): ContractDecision {
  const value = store.readJson("contract-decision.json");
  if (!value) {
    throw new Error("Missing contract-decision artifact.");
  }
  return parseArtifact("contract-decision", value);
}

export function sameCanonicalHash(a: PageContract, b: PageContract): boolean {
  return canonicalizeContract(a).hash === canonicalizeContract(b).hash;
}

export { ContractExhaustedError };
