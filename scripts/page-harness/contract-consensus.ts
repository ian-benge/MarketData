import type { AgentHost } from "./agents";
import { AgentInvocationError } from "./agents";
import type { ArtifactStore } from "./artifacts";
import type { RunBudget } from "./budget";
import { wrapUntrusted } from "./injection";
import { contractReviewPrompt } from "./prompts";
import type { IsolatedWorkspace } from "./isolation";
import type { RunMachine } from "./machine";
import {
  canonicalizeContract,
  parseArtifact,
  type ContractDecision,
  type PageContract,
} from "./schemas";
import { sha256Json } from "./util";
import type { Logger } from "./util";
import type { ContractReviewRole } from "./resume";
import { nowIso } from "./util";

export type ContractConsensusDeps = {
  host: AgentHost;
  store: ArtifactStore;
  isolation: IsolatedWorkspace;
  budget: RunBudget;
  log: Logger;
  machine?: RunMachine;
  persistBudget?: () => void;
};

export type ContractResume = {
  startRound: number;
  skipBuilder: boolean;
};

export async function agreeContract(options: {
  route: string;
  objective: string;
  contract: PageContract;
  maxRounds: number;
  deps: ContractConsensusDeps;
  resume?: ContractResume;
}): Promise<{ contract: PageContract; hash: string; rounds: number }> {
  let current = canonicalizeContract(options.contract);
  if (!options.deps.store.readJson("contract-proposal-0.json")) {
    options.deps.store.writeJson("contract-proposal-0.json", {
      hash: current.hash,
      contract: current.contract,
    });
  }

  const startRound = options.resume?.startRound ?? 1;

  for (let round = startRound; round <= options.maxRounds; round += 1) {
    options.deps.budget.assert();
    const existingBuilder = options.deps.store.readJson(
      `contract-decision-builder-${round}.json`,
    );
    const existingEvaluator = options.deps.store.readJson(
      `contract-decision-evaluator-${round}.json`,
    );
    if (existingBuilder && existingEvaluator) {
      parseArtifact("contract-decision", existingBuilder);
      parseArtifact("contract-decision", existingEvaluator);
      options.deps.machine?.markContractRoundComplete(round, current.hash);
      continue;
    }

    const json = JSON.stringify(current.contract, null, 2);
    let builderDecision: ContractDecision;
    if (existingBuilder) {
      builderDecision = parseArtifact("contract-decision", existingBuilder);
    } else {
      builderDecision = await invokeReviewer({
        round,
        role: "builder",
        route: options.route,
        objective: options.objective,
        contractJson: json,
        contractHash: current.hash,
        deps: options.deps,
      });
      options.deps.store.writeJson(
        `contract-decision-builder-${round}.json`,
        builderDecision,
      );
    }

    let evaluatorDecision: ContractDecision;
    if (existingEvaluator) {
      evaluatorDecision = parseArtifact("contract-decision", existingEvaluator);
    } else {
      evaluatorDecision = await invokeReviewer({
        round,
        role: "evaluator",
        route: options.route,
        objective: options.objective,
        contractJson: json,
        contractHash: current.hash,
        deps: options.deps,
      });
      options.deps.store.writeJson(
        `contract-decision-evaluator-${round}.json`,
        evaluatorDecision,
      );
    }

    options.deps.machine?.markContractRoundComplete(round, current.hash);

    const builderAccept =
      builderDecision.decision === "accept" &&
      builderDecision.acceptedHash === current.hash;
    const evaluatorAccept =
      evaluatorDecision.decision === "accept" &&
      evaluatorDecision.acceptedHash === current.hash;

    if (builderAccept && evaluatorAccept) {
      options.deps.log.info(`contract agreed hash=${current.hash.slice(0, 12)}`);
      options.deps.store.writeJson("contract-agreement.json", {
        hash: current.hash,
        agreedAt: new Date().toISOString(),
        rounds: round,
      });
      return { contract: current.contract, hash: current.hash, rounds: round };
    }

    const builderNext = replacementOf(builderDecision);
    const evaluatorNext = replacementOf(evaluatorDecision);

    if (builderNext && evaluatorNext && builderNext.hash !== evaluatorNext.hash) {
      options.deps.store.writeJson(`contract-conflict-${round}.json`, {
        builderHash: builderNext.hash,
        evaluatorHash: evaluatorNext.hash,
        builder: builderNext.contract,
        evaluator: evaluatorNext.contract,
      });
      options.deps.log.warn(`contract conflict at round ${round}`);
      const chosen =
        builderNext.hash < evaluatorNext.hash ? builderNext : evaluatorNext;
      current = chosen;
      options.deps.store.writeJson("contract.json", current.contract);
      if (options.deps.machine) {
        options.deps.machine.state.canonicalProposalHash = current.hash;
        options.deps.machine.persist();
      }
      options.deps.store.writeText(
        `contract-conflict-${round}.note.md`,
        wrapUntrusted(
          "conflicting-amendments",
          `Builder hash ${builderNext.hash}\nEvaluator hash ${evaluatorNext.hash}\nNext candidate is the lexicographically smaller hash. Both reviewers must accept it.`,
        ),
      );
      continue;
    }

    const next = evaluatorNext ?? builderNext;
    if (!next) {
      options.deps.log.info(`contract round ${round} still open (no replacement)`);
      continue;
    }
    current = next;
    options.deps.store.writeJson("contract.json", current.contract);
    options.deps.store.writeJson(`contract-proposal-${round}.json`, {
      hash: current.hash,
      contract: current.contract,
    });
    if (options.deps.machine) {
      options.deps.machine.state.canonicalProposalHash = current.hash;
      options.deps.machine.persist();
    }
    options.deps.log.info(`contract round ${round} proposed hash=${current.hash.slice(0, 12)}`);
  }

  throw new Error(
    "Builder and evaluator did not accept the same canonical contract hash. Refusing to edit.",
  );
}

async function invokeReviewer(options: {
  round: number;
  role: ContractReviewRole;
  route: string;
  objective: string;
  contractJson: string;
  contractHash: string;
  deps: ContractConsensusDeps;
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
    await reviewer.send(
      contractReviewPrompt({
        role: options.role,
        route: options.route,
        objective: options.objective,
        contractJson: options.contractJson,
        contractHash: options.contractHash,
      }),
    );
    const decision = readDecision(options.deps.store);
    options.deps.machine?.setIncompleteInvocation(null);
    options.deps.persistBudget?.();
    return decision;
  } catch (error) {
    const runId =
      error instanceof AgentInvocationError ? error.runId ?? null : null;
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
    options.deps.persistBudget?.();
    throw error;
  } finally {
    await reviewer.close();
  }
}

function replacementOf(decision: ContractDecision) {
  if (decision.decision !== "amend" || !decision.contract) return null;
  return canonicalizeContract(decision.contract);
}

function readDecision(store: ArtifactStore): ContractDecision {
  const value = store.readJson("contract-decision.json");
  if (!value) {
    throw new Error("Missing contract-decision artifact.");
  }
  return value as ContractDecision;
}

export function sameCanonicalHash(a: PageContract, b: PageContract): boolean {
  return sha256Json(a) === sha256Json(b);
}
