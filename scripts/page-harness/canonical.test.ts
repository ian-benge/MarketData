import { describe, expect, it } from "vitest";
import { normativeContractHash } from "./canonical";
import { canonicalizeContract } from "./schemas";
import { sampleContract } from "./test-fixtures";

describe("normative contract canonicalization", () => {
  it("produces the same hash for reordered set-like collections and gates", () => {
    const base = sampleContract();
    const reordered = {
      ...base,
      intendedOutcomes: [...base.intendedOutcomes].reverse(),
      implementationBoundaries: {
        mayChange: [...base.implementationBoundaries.mayChange].reverse(),
        mustPreserve: [...base.implementationBoundaries.mustPreserve].reverse(),
        mustNot: [...base.implementationBoundaries.mustNot].reverse(),
      },
      testableBehavior: [...base.testableBehavior].reverse(),
      dataCorrectness: [...base.dataCorrectness].reverse(),
      traderWorkflows: [...base.traderWorkflows].reverse(),
      acceptanceGates: [...base.acceptanceGates].reverse(),
      performanceExpectations: {
        ...base.performanceExpectations,
        preserveOrImprove: [...base.performanceExpectations.preserveOrImprove].reverse(),
      },
    };
    expect(canonicalizeContract(reordered).hash).toBe(canonicalizeContract(base).hash);
    expect(normativeContractHash(reordered)).toBe(normativeContractHash(base));
  });

  it("ignores non-normative reviewer prose such as repairContext", () => {
    const base = sampleContract();
    const prose = {
      ...base,
      acceptanceGates: base.acceptanceGates.map((gate) => ({
        ...gate,
        repairContext: `${gate.repairContext} Additional reviewer rationale that must not change the hash.`,
      })),
    };
    expect(canonicalizeContract(prose).hash).toBe(canonicalizeContract(base).hash);
  });

  it("treats genuine observable and user-outcome differences as distinct contracts", () => {
    const base = sampleContract();
    const observable = {
      ...base,
      acceptanceGates: base.acceptanceGates.map((gate, index) =>
        index === 0
          ? {
              ...gate,
              observable:
                "inspect.json headings array contains Access denied as the unique document h1 string.",
            }
          : gate,
      ),
    };
    const outcome = {
      ...base,
      acceptanceGates: base.acceptanceGates.map((gate, index) =>
        index === 0
          ? {
              ...gate,
              userOutcome:
                "A visitor denied access can identify the 403 state from the unique Access denied heading.",
            }
          : gate,
      ),
    };
    expect(canonicalizeContract(observable).hash).not.toBe(canonicalizeContract(base).hash);
    expect(canonicalizeContract(outcome).hash).not.toBe(canonicalizeContract(base).hash);
    expect(canonicalizeContract(observable).hash).not.toBe(canonicalizeContract(outcome).hash);
  });

  it("preserves ordered workflow steps as a material distinction", () => {
    const base = sampleContract();
    const workflow = base.traderWorkflows[0];
    if (!workflow || workflow.steps.length < 2) return;
    const reorderedSteps = {
      ...base,
      traderWorkflows: [
        { ...workflow, steps: [...workflow.steps].reverse() },
        ...base.traderWorkflows.slice(1),
      ],
    };
    expect(canonicalizeContract(reorderedSteps).hash).not.toBe(canonicalizeContract(base).hash);
  });
});
