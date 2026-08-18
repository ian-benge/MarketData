import type { AcceptanceGate, PageContract } from "./schemas";
import { sha256Json } from "./util";

const NON_NORMATIVE_GATE_KEYS = new Set(["repairContext"]);

export type NormativeGate = Omit<AcceptanceGate, "repairContext">;

export function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export function sortStrings(items: string[]): string[] {
  return [...items].sort((a, b) => a.localeCompare(b));
}

export function normativeGate(gate: AcceptanceGate): NormativeGate {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(gate)) {
    if (NON_NORMATIVE_GATE_KEYS.has(key)) continue;
    if (value === undefined) continue;
    rest[key] = value;
  }
  return rest as NormativeGate;
}

export function normativeContractView(contract: PageContract): unknown {
  return {
    page: contract.page,
    objective: contract.objective,
    intendedOutcomes: sortStrings(contract.intendedOutcomes),
    traderWorkflows: sortById(contract.traderWorkflows).map((workflow) => ({
      id: workflow.id,
      description: workflow.description,
      actor: workflow.actor,
      steps: workflow.steps,
      success: workflow.success,
    })),
    implementationBoundaries: {
      mayChange: sortStrings(contract.implementationBoundaries.mayChange),
      mustPreserve: sortStrings(contract.implementationBoundaries.mustPreserve),
      mustNot: sortStrings(contract.implementationBoundaries.mustNot),
    },
    testableBehavior: sortById(contract.testableBehavior).map((row) => ({
      id: row.id,
      description: row.description,
      howToVerify: row.howToVerify,
      required: row.required,
    })),
    performanceExpectations: {
      measureBeforeChange: contract.performanceExpectations.measureBeforeChange,
      preserveOrImprove: sortStrings(contract.performanceExpectations.preserveOrImprove),
      repeatSamples: contract.performanceExpectations.repeatSamples,
      budgets: contract.performanceExpectations.budgets,
    },
    dataCorrectness: sortById(contract.dataCorrectness).map((row) => ({
      id: row.id,
      description: row.description,
      sourceOfTruth: row.sourceOfTruth,
      required: row.required,
      ...(row.sampleOrFormula ? { sampleOrFormula: row.sampleOrFormula } : {}),
    })),
    acceptanceGates: sortById(contract.acceptanceGates).map(normativeGate),
    shallowFeatureBan: contract.shallowFeatureBan,
  };
}

export function persistableContract(contract: PageContract): PageContract {
  return {
    ...contract,
    intendedOutcomes: sortStrings(contract.intendedOutcomes),
    traderWorkflows: sortById(contract.traderWorkflows),
    implementationBoundaries: {
      mayChange: sortStrings(contract.implementationBoundaries.mayChange),
      mustPreserve: sortStrings(contract.implementationBoundaries.mustPreserve),
      mustNot: sortStrings(contract.implementationBoundaries.mustNot),
    },
    testableBehavior: sortById(contract.testableBehavior),
    performanceExpectations: {
      ...contract.performanceExpectations,
      preserveOrImprove: sortStrings(contract.performanceExpectations.preserveOrImprove),
    },
    dataCorrectness: sortById(contract.dataCorrectness),
    acceptanceGates: sortById(contract.acceptanceGates),
  };
}

export function normativeContractHash(contract: PageContract): string {
  return sha256Json(normativeContractView(contract));
}

export function gatesNormativelyEqual(a: AcceptanceGate, b: AcceptanceGate): boolean {
  return sha256Json(normativeGate(a)) === sha256Json(normativeGate(b));
}

export function stringSetsEqual(a: string[], b: string[]): boolean {
  const left = sortStrings(a);
  const right = sortStrings(b);
  return sha256Json(left) === sha256Json(right);
}
