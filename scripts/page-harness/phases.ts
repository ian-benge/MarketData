export const HARNESS_PHASES = [
  "PRECHECK",
  "WORKTREE",
  "BASELINE",
  "PLAN",
  "CONTRACT_DRAFT",
  "DUAL_REVIEW",
  "CONTRACT_LOCK",
  "BUILD",
  "VERIFY",
  "EVALUATE",
  "OPTIONAL_SKEPTIC",
  "CHECKPOINT",
  "REPAIR_OR_FINISH",
  "RESTORE_BEST",
  "REPORT",
] as const;

export type HarnessPhase = (typeof HARNESS_PHASES)[number];

export type PhaseStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export type PhaseRecord<I = unknown, R = unknown> = {
  phase: HarnessPhase;
  status: PhaseStatus;
  iteration?: number;
  startedAt: string | null;
  endedAt: string | null;
  input: I | null;
  result: R | null;
  error: string | null;
};

export const LOOP_PHASES: HarnessPhase[] = [
  "BUILD",
  "VERIFY",
  "EVALUATE",
  "OPTIONAL_SKEPTIC",
  "CHECKPOINT",
  "REPAIR_OR_FINISH",
];

export function emptyPhase(phase: HarnessPhase): PhaseRecord {
  return {
    phase,
    status: "pending",
    startedAt: null,
    endedAt: null,
    input: null,
    result: null,
    error: null,
  };
}

export function isLoopPhase(phase: HarnessPhase): boolean {
  return LOOP_PHASES.includes(phase);
}

export function editsAllowed(current: HarnessPhase | null, contractLocked: boolean): boolean {
  if (!contractLocked) return false;
  if (!current) return false;
  return (
    current === "BUILD" ||
    current === "CHECKPOINT" ||
    current === "REPAIR_OR_FINISH" ||
    current === "RESTORE_BEST"
  );
}
