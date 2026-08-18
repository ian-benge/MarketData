import type { AgentHost } from "./agents";
import type { ArtifactStore } from "./artifacts";
import type { RunBudget } from "./budget";
import { wrapUntrusted } from "./injection";
import { contractReviewPrompt } from "./prompts";
import type { IsolatedWorkspace } from "./isolation";
import {
  canonicalizeContract,
  type ContractDecision,
  type PageContract,
} from "./schemas";
import { sha256Json } from "./util";
import type { Logger } from "./util";

export type ContractConsensusDeps = {
  host: AgentHost;
  store: ArtifactStore;
  isolation: IsolatedWorkspace;
  budget: RunBudget;
  log: Logger;
};

export async function agreeContract(options: {
  route: string;
  objective: string;
  contract: PageContract;
  maxRounds: number;
  deps: ContractConsensusDeps;
}): Promise<{ contract: PageContract; hash: string; rounds: number }> {
  let current = canonicalizeContract(options.contract);
  options.deps.store.writeJson("contract-proposal-0.json", {
    hash: current.hash,
    contract: current.contract,
  });

  for (let round = 1; round <= options.maxRounds; round += 1) {
    options.deps.budget.assert();
    const json = JSON.stringify(current.contract, null, 2);
    const builder = await options.deps.host.open({
      role: "builder",
      cwd: options.deps.isolation.agentCwd,
      purpose: "contract_reviewer",
    });
    let builderDecision: ContractDecision;
    try {
      await builder.send(
        contractReviewPrompt({
          role: "builder",
          route: options.route,
          objective: options.objective,
          contractJson: json,
          contractHash: current.hash,
        }),
      );
      builderDecision = readDecision(options.deps.store);
    } finally {
      await builder.close();
    }
    options.deps.store.writeJson(
      `contract-decision-builder-${round}.json`,
      builderDecision,
    );

    const evaluator = await options.deps.host.open({
      role: "evaluator",
      cwd: options.deps.isolation.agentCwd,
      purpose: "contract_reviewer",
    });
    let evaluatorDecision: ContractDecision;
    try {
      await evaluator.send(
        contractReviewPrompt({
          role: "evaluator",
          route: options.route,
          objective: options.objective,
          contractJson: json,
          contractHash: current.hash,
        }),
      );
      evaluatorDecision = readDecision(options.deps.store);
    } finally {
      await evaluator.close();
    }
    options.deps.store.writeJson(
      `contract-decision-evaluator-${round}.json`,
      evaluatorDecision,
    );

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
    options.deps.log.info(`contract round ${round} proposed hash=${current.hash.slice(0, 12)}`);
  }

  throw new Error(
    "Builder and evaluator did not accept the same canonical contract hash. Refusing to edit.",
  );
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
