import { describe, expect, it } from "vitest";
import {
  ContractExhaustedError,
  disagreementManifest,
  reconcileContractDecisions,
  scopedContractForDispute,
} from "./contract-ops";
import { canonicalizeContract } from "./schemas";
import { sampleContract } from "./test-fixtures";

function acceptDecision(hash: string) {
  return {
    decision: "accept" as const,
    acceptedHash: hash,
    proposalHash: hash,
    amendments: [],
    rationale: "ok",
  };
}

describe("ops-based contract reconciliation", () => {
  it("freezes accepted gates and keeps only unresolved items in the disagreement manifest", () => {
    const proposal = sampleContract();
    const hash = canonicalizeContract(proposal).hash;
    const competing = {
      ...proposal.acceptanceGates[0]!,
      observable:
        "inspect.json headings array contains Access denied as the unique document h1 string.",
      userOutcome:
        "A visitor denied access can identify the 403 state from the unique Access denied heading.",
    };
    const state = reconcileContractDecisions({
      proposal,
      proposalHash: hash,
      reviews: [
        { role: "builder", decision: acceptDecision(hash) },
        {
          role: "evaluator",
          decision: {
            decision: "ops",
            proposalHash: hash,
            operations: [{ op: "dispute_gate", id: competing.id, competing }],
            rationale: "observable is not strict enough",
            amendments: [],
          },
        },
      ],
    });
    expect(state.unresolved).toHaveLength(1);
    expect(state.unresolved[0]).toMatchObject({ kind: "gate", id: competing.id });
    expect(state.frozenGateIds).not.toContain(competing.id);
    expect(state.frozenGateIds.length).toBe(proposal.acceptanceGates.length - 1);
    const manifest = disagreementManifest(hash, state);
    expect(manifest.unresolved.map((item) => (item.kind === "gate" ? item.id : item.path))).toEqual([
      competing.id,
    ]);
    const scoped = scopedContractForDispute({ contract: state.contract, unresolved: state.unresolved });
    expect(scoped.gates.map((gate) => gate.id)).toEqual([competing.id]);
  });

  it("does not treat equivalent repairContext-only rewrites as conflicts", () => {
    const proposal = sampleContract();
    const hash = canonicalizeContract(proposal).hash;
    const rewritten = {
      ...proposal,
      acceptanceGates: proposal.acceptanceGates.map((gate) => ({
        ...gate,
        repairContext: `${gate.repairContext} Rewritten reviewer prose.`,
      })),
    };
    const state = reconcileContractDecisions({
      proposal,
      proposalHash: hash,
      reviews: [
        { role: "builder", decision: acceptDecision(hash) },
        {
          role: "evaluator",
          decision: {
            decision: "amend",
            proposalHash: hash,
            contract: rewritten,
            amendments: ["prose"],
            rationale: "only repair notes",
          },
        },
      ],
    });
    expect(state.unresolved).toEqual([]);
    expect(state.hash).toBe(hash);
  });

  it("reports unresolved gates on contract exhaustion and refuses to build", () => {
    const error = new ContractExhaustedError(
      [
        {
          kind: "gate",
          id: "ui_ux.core",
          proposal: sampleContract().acceptanceGates[0] ?? null,
          votes: [
            { role: "builder", kind: "accept" },
            { role: "evaluator", kind: "dispute" },
          ],
        },
      ],
      3,
    );
    expect(error.category).toBe("contract_exhausted");
    expect(error.message).toMatch(/contract_exhausted/);
    expect(error.message).toMatch(/gate:ui_ux.core/);
    expect(error.message).toMatch(/Refusing to BUILD/);
  });
});
