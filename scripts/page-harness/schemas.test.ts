import { describe, expect, it } from "vitest";
import { EVAL_DIMENSIONS, evaluationCompleteness, parseArtifact } from "./schemas";
import { sampleContract, sampleEvaluation } from "./test-fixtures";

describe("page contract schema", () => {
  it("rejects a contract that skips evaluation dimensions", () => {
    expect(() =>
      parseArtifact("contract", {
        ...sampleContract(),
        acceptanceGates: [
          {
            id: "ui_ux.core",
            dimension: "ui_ux",
            classification: "required",
            userOutcome: "Trader sees the authorization state.",
            observable: "looks professional",
            verificationMethod: "screenshot",
            evidenceArtifact: "inspect.json",
            expected: { kind: "binary", result: true },
            baselineValue: null,
            failureSeverity: "severe",
            repairContext: "Fix the heading and tab order on the 403 page.",
          },
        ],
      }),
    ).toThrow(/Invalid contract/);
  });

  it("rejects vague observables even when all dimensions exist", () => {
    const contract = sampleContract();
    contract.acceptanceGates[0] = {
      ...contract.acceptanceGates[0]!,
      observable: "The page feels fast and is intuitive for traders.",
    };
    expect(() => parseArtifact("contract", contract)).toThrow(/vague/);
  });

  it("rejects or normalizes implementation-prescriptive observables", () => {
    expect(() =>
      parseArtifact("contract", {
        ...sampleContract(),
        acceptanceGates: sampleContract().acceptanceGates.map((gate, index) =>
          index === 0
            ? {
                ...gate,
                observable: "export const UNLOCK_TTL_MS from src/lib/positions/owner-unlock.ts",
              }
            : gate,
        ),
      }),
    ).toThrow(/implementation|observable|Invalid contract/i);

    const mixed = sampleContract();
    mixed.acceptanceGates[0] = {
      ...mixed.acceptanceGates[0]!,
      observable:
        "The page shows unlock TTL hours as an integer in the lock panel. export const UNLOCK_TTL_MS from src/lib/positions/owner-unlock.ts",
    };
    const parsed = parseArtifact("contract", mixed);
    expect(parsed.acceptanceGates[0]?.observable).not.toMatch(/UNLOCK_TTL_MS/);
    expect(parsed.acceptanceGates[0]?.repairContext).toMatch(/UNLOCK_TTL_MS/);
  });

  it("requires evidence on required gates and rejects required not_applicable", () => {
    const completeness = evaluationCompleteness(sampleContract(), {
      ...sampleEvaluation(true),
      criteria: [
        {
          id: "ui_ux.core",
          verdict: "pass",
          evidence: [],
          notes: "looks fine",
        },
        {
          id: "keyboard_workflow.core",
          verdict: "not_applicable",
          evidence: [{ kind: "keyboard", path: "inspect.json", note: "n/a" }],
          notes: "skipped",
        },
      ],
      allRequiredPassed: true,
    });
    expect(completeness.missing.length).toBeGreaterThan(10);
    expect(completeness.noEvidence).toContain("ui_ux.core");
    expect(completeness.illegalNotApplicable).toContain("keyboard_workflow.core");
    expect(completeness.ineligibleEvidence).toEqual([]);
  });

  it("treats pending contract-hash evidence as ineligible for a pass", () => {
    const completeness = evaluationCompleteness(
      sampleContract(),
      sampleEvaluation(true, "locked-hash-value"),
      {
        phase: "audit",
        lockedContractHash: "locked-hash-value",
        inspectMeta: {
          runId: "r1",
          route: "/denied",
          contractHash: "pending",
          iteration: 0,
          worktreeSha: "abc",
          timestamp: "2026-08-17T12:00:00.000Z",
          serverOrigin: "http://127.0.0.1:3200",
          browser: "chrome",
          generatingCommand: "inspectRoute",
        },
        runId: "r1",
        route: "/denied",
        iteration: 0,
      },
    );
    expect(completeness.ineligibleEvidence.length).toBeGreaterThan(0);
  });

  it("rejects or normalizes implementation-prescriptive observables", () => {
    expect(() =>
      parseArtifact("contract", {
        ...sampleContract(),
        acceptanceGates: sampleContract().acceptanceGates.map((gate, index) =>
          index === 0
            ? {
                ...gate,
                observable: "export const UNLOCK_TTL_MS from src/lib/positions/owner-unlock.ts",
              }
            : gate,
        ),
      }),
    ).toThrow(/implementation|observable|Invalid contract/i);

    const mixed = sampleContract();
    mixed.acceptanceGates[0] = {
      ...mixed.acceptanceGates[0]!,
      observable:
        "The page shows unlock TTL hours as an integer in the lock panel. export const UNLOCK_TTL_MS from src/lib/positions/owner-unlock.ts",
    };
    const parsed = parseArtifact("contract", mixed);
    expect(parsed.acceptanceGates[0]?.observable).not.toMatch(/UNLOCK_TTL_MS/);
    expect(parsed.acceptanceGates[0]?.repairContext).toMatch(/UNLOCK_TTL_MS/);
  });
});
