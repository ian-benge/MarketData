import { describe, expect, it } from "vitest";
import { sampleContract, sampleEvaluation, sampleInspect } from "./test-fixtures";
import { evidenceMeta } from "./evidence";
import {
  afterInspectReportLine,
  assessAuditReuseValidity,
  auditAfterEvidence,
  buildHarnessRequest,
  collectedAfterEvidence,
  CriticalSkepticRequiredError,
  deriveContractResult,
  evaluatedWorktreeSha,
  mergeTargetVerification,
  parseRiskLevel,
  resolveRiskPolicy,
  resolveSkeptic,
} from "./policy";
import { evaluationCompleteness } from "./schemas";
import { accountSdkUsage, emptyAggregatedUsage } from "./usage";

describe("risk policy", () => {
  it("expands verification, skeptic, and regression requirements by risk", () => {
    const low = resolveRiskPolicy("low");
    const medium = resolveRiskPolicy("medium");
    const critical = resolveRiskPolicy("critical");
    expect(low.requireSkeptic).toBe(false);
    expect(low.allowDisableSkeptic).toBe(true);
    expect(low.requireAdjacentRegression).toBe(false);
    expect(low.playwrightTimeoutMs).toBeLessThan(medium.playwrightTimeoutMs);
    expect(medium.requireAdjacentRegression).toBe(true);
    expect(critical.requireSkeptic).toBe(true);
    expect(critical.allowDisableSkeptic).toBe(false);
    expect(critical.requireAdjacentRegression).toBe(true);
    expect(critical.inspectSamples).toBeGreaterThan(low.inspectSamples);
    expect(critical.playwrightTimeoutMs).toBeGreaterThan(medium.playwrightTimeoutMs);
    expect(parseRiskLevel(undefined, true)).toBe("critical");
    expect(parseRiskLevel("low", true)).toBe("low");
  });

  it("refuses --no-skeptic on critical improvement runs", () => {
    expect(() =>
      resolveSkeptic({ risk: "critical", auditOnly: false, noSkeptic: true }),
    ).toThrow(CriticalSkepticRequiredError);
    expect(() =>
      buildHarnessRequest({
        route: "/settings",
        pageCritical: true,
        suppliedObjective: "x",
        auditOnly: false,
        noSkeptic: true,
        risk: "critical",
        maxIterations: 1,
        maxDurationMinutes: 5,
        maxContractRounds: 1,
        maxAgentRuns: 5,
        maxTotalTokens: 1000,
        inspectRole: "member",
        fromAudit: null,
        resumeRunId: null,
        allowNoSandbox: true,
      }),
    ).toThrow(/require a skeptic/);
    expect(
      resolveSkeptic({ risk: "critical", auditOnly: true, noSkeptic: true }).skeptic,
    ).toBe(false);
    expect(resolveSkeptic({ risk: "low", auditOnly: false, noSkeptic: true }).skeptic).toBe(
      false,
    );
  });
});

describe("process status vs contract result", () => {
  it("can complete an audit process while the contract fails", () => {
    const completeness = evaluationCompleteness(sampleContract(), sampleEvaluation(false));
    const contractResult = deriveContractResult({
      evaluation: sampleEvaluation(false),
      completeness,
      targetRouteVerified: true,
    });
    expect(contractResult).toBe("failed");
    const before = sampleInspect();
    expect(afterInspectReportLine(auditAfterEvidence(), before)).toMatch(/unavailable/);
    expect(afterInspectReportLine(collectedAfterEvidence(before), before)).toMatch(
      /unavailable|refusing to alias/i,
    );
  });
});

describe("target route verification", () => {
  it("does not let an unrelated-suite timeout substitute for the requested route", () => {
    const inspect = sampleInspect({
      route: "/settings",
      finalUrl: "http://127.0.0.1:3200/settings",
      finalPathname: "/settings",
      routeVerified: true,
    });
    const merged = mergeTargetVerification({
      requestedRoute: "/settings",
      inspect,
      expectedOrigin: "http://127.0.0.1:3200",
      verify: [
        {
          name: "playwright-unrelated",
          ok: false,
          output:
            'navigating to "http://127.0.0.1:3200/watchlists", waiting until "load"\nTest timeout of 30000ms exceeded.',
          scope: "unrelated",
        },
      ],
    });
    expect(merged.targetOk).toBe(true);
    expect(merged.targetVisited).toBe(true);
    expect(merged.unrelatedFailures).toHaveLength(1);
    expect(merged.unrelatedFailures[0]?.output).toMatch(/watchlists/);
  });

  it("fails target verification when the requested route was never visited", () => {
    const inspect = sampleInspect({
      route: "/settings",
      finalUrl: "http://127.0.0.1:3200/watchlists",
      finalPathname: "/watchlists",
      routeVerified: false,
    });
    const merged = mergeTargetVerification({
      requestedRoute: "/settings",
      inspect,
      expectedOrigin: "http://127.0.0.1:3200",
      verify: [
        {
          name: "playwright",
          ok: false,
          output: 'navigating to "http://127.0.0.1:3200/watchlists"',
          scope: "unrelated",
        },
      ],
    });
    expect(merged.targetOk).toBe(false);
    expect(merged.targetVisited).toBe(false);
  });
});

describe("audit reuse validity", () => {
  it("refuses pending-hash evidence without provenance and aliased after fields", () => {
    const verdict = assessAuditReuseValidity({
      processStatus: "audit_complete",
      contractResult: "failed",
      auditOnly: true,
      contractLocked: true,
      fingerprint: {
        route: "/settings",
        objective: "Improve Settings for traders without shallow or disconnected work.",
        suppliedObjective: null,
        baseSha: "abc",
        contractHash: "a".repeat(64),
        inspectRole: "member",
      },
      current: {
        route: "/settings",
        objective: "Improve Settings for traders without shallow or disconnected work.",
        suppliedObjective: null,
        baseSha: "abc",
        inspectRole: "member",
      },
      provenance: null,
      baselineInspectMeta: evidenceMeta({
        runId: "settings-20260817-76262336",
        route: "/settings",
        contractHash: "pending",
        iteration: 0,
        worktreeSha: "abc",
        serverOrigin: "http://127.0.0.1:3200",
        browser: "chrome",
        generatingCommand: "inspectRoute baseline",
      }),
      targetRouteVerified: false,
      afterAliasedFromBaseline: true,
      usage: emptyAggregatedUsage(),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toMatch(/alias|requested route|provenance/i);
    }
  });
});

describe("checkpoint SHA", () => {
  it("prefers the evaluated worktree SHA over the original base SHA", () => {
    expect(evaluatedWorktreeSha({ evaluatedSha: "iter-sha", baseSha: "base" })).toBe(
      "iter-sha",
    );
    expect(accountSdkUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }).availability).toBe(
      "unknown",
    );
  });
});
