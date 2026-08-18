import { EVAL_DIMENSIONS, type Evaluation, type PageContract } from "./schemas";
import type { InspectReport } from "./inspect";

export function dimensionGate(
  dimension: (typeof EVAL_DIMENSIONS)[number],
  extra: Partial<PageContract["acceptanceGates"][number]> = {},
): PageContract["acceptanceGates"][number] {
  return {
    id: `${dimension}.core`,
    dimension,
    classification: "required",
    userOutcome: `A trader can complete the ${dimension.replace(/_/g, " ")} check using visible page controls.`,
    observable: `The ${dimension.replace(/_/g, " ")} requirement is present in inspect.json or a named test with a binary or numeric result.`,
    verificationMethod: "code_inspect",
    evidenceArtifact: "inspect/before/inspect.json",
    expected: { kind: "binary", result: true },
    baselineValue: null,
    failureSeverity: "severe",
    repairContext: `Use the inspect artifacts and page source to satisfy ${dimension}.`,
    ...extra,
  };
}

export function sampleContract(route = "/denied"): PageContract {
  return {
    page: { route, title: "Access denied", role: "public" },
    objective: "Keep authorization copy honest and keyboard-complete.",
    intendedOutcomes: ["A member hitting a forbidden route sees a 403 state and can return to Market Overview from the keyboard."],
    traderWorkflows: [
      {
        id: "return-to-market",
        description: "Return to Market Overview without a mouse",
        actor: "member",
        steps: ["Tab to the primary action", "Activate with Enter"],
        success: "Navigates to /dashboard",
      },
    ],
    implementationBoundaries: {
      mayChange: ["src/app/denied/page.tsx", "src/components/ui/AccessFrame.tsx"],
      mustPreserve: ["Authorization copy meaning", "No data mutation"],
      mustNot: ["Call vendor APIs", "Push", "Merge", "Stub a fake permission grant"],
    },
    testableBehavior: [
      {
        id: "h1",
        description: "Single h1 Access denied",
        howToVerify: "Playwright heading role Access denied count is 1",
        required: true,
      },
    ],
    performanceExpectations: {
      measureBeforeChange: true,
      preserveOrImprove: ["navigationMsMedian", "transferKb", "consoleErrors"],
      repeatSamples: 3,
      budgets: { maxConsoleErrors: 0, noDuplicatePolling: true },
    },
    dataCorrectness: [
      {
        id: "no-false-grant",
        description: "Page must not imply access was granted",
        sourceOfTruth: "src/app/denied/page.tsx",
        required: true,
      },
    ],
    acceptanceGates: EVAL_DIMENSIONS.map((dimension) => dimensionGate(dimension)),
    shallowFeatureBan: {
      noStubs: true,
      noDisplayOnly: true,
      noDisconnected: true,
      noVisualOnlyWithoutBehavior: true,
    },
  };
}

export function sampleEvaluation(pass: boolean, contractHash = "hash"): Evaluation {
  return {
    role: "evaluator",
    contractHash,
    iteration: pass ? 1 : 0,
    summary: pass ? "Gates evidenced from orchestrator inspect." : "Keyboard path missing from tab order.",
    criteria: EVAL_DIMENSIONS.map((dimension) => ({
      id: `${dimension}.core`,
      dimension,
      verdict: pass ? "pass" : dimension === "keyboard_workflow" ? "fail" : "pass",
      evidence: [
        {
          kind: "screenshot",
          path: "inspect.json",
          note: "orchestrator inspect",
          observation: pass ? "gate observed" : "keyboard gap",
        },
      ],
      notes: "from inspect",
    })),
    shallowOrDisconnected: [],
    targetedRepair: pass
      ? []
      : [
          {
            criterionId: "keyboard_workflow.core",
            problem: "Primary action not in tab order",
            evidence: [{ kind: "keyboard", path: "inspect.json", note: "tab", observation: "no focus ring" }],
            requestedFix: "Ensure EdgeActionLink is focusable",
          },
        ],
    allRequiredPassed: pass,
    freshnessConfirmed: true,
  };
}

export function sampleInspect(overrides: Partial<InspectReport> = {}): InspectReport {
  return {
    route: "/denied",
    baseUrl: "http://127.0.0.1:3200",
    role: "public",
    title: "Access denied",
    finalUrl: "http://127.0.0.1:3200/denied",
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    network: [],
    duplicateGets: [],
    transferKb: 80,
    documentRequests: 1,
    jsTransferKb: 40,
    navigationMs: 200,
    navigationSamplesMs: [190, 200, 210],
    navigationMsMedian: 200,
    navigationMsVariance: 100,
    overflowByViewport: { "desktop-1440": 0, "laptop-1024": 0, "tablet-768": 0, "mobile-375": 0 },
    landmarks: { banner: 0, main: 1, navigation: 0, contentinfo: 0 },
    keyboardTabOrder: [
      { tag: "A", text: "Return to Market Overview", href: "/dashboard" },
      { tag: "A", text: "Open Research Archive", href: "/archive" },
    ],
    a11y: {
      h1Count: 1,
      hasMain: true,
      duplicateIds: [],
      unlabeledControls: [],
      unnamedActions: [],
    },
    headings: ["h1: Access denied"],
    screenshots: ["desktop-1440.png"],
    states: { loading: false, empty: false, error: false, degraded: false },
    reactEvidence: { supported: false, note: "React profiler not attached in headless Chrome" },
    measuredAt: new Date().toISOString(),
    meta: {
      runId: "test",
      route: "/denied",
      contractHash: "pending",
      iteration: 0,
      worktreeSha: "abc",
      timestamp: new Date().toISOString(),
      serverOrigin: "http://127.0.0.1:3200",
      browser: "chrome",
      viewport: "desktop-1440",
      generatingCommand: "inspectRoute",
    },
    finalPathname: "/denied",
    routeVerified: true,
    auth: {
      attempted: false,
      ok: true,
      cookiePresent: false,
      endpointStatus: null,
    },
    ...overrides,
  };
}
