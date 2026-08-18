import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  emptyPhase,
  HARNESS_PHASES,
  isLoopPhase,
  type HarnessPhase,
  type PhaseRecord,
  type PhaseStatus,
} from "./phases";
import { canonicalJson, nowIso } from "./util";
import type { HarnessRequest } from "./request";

export type IterationRecord = {
  n: number;
  phases: Partial<Record<HarnessPhase, PhaseRecord>>;
};

export type MachineState = {
  version: 2 | 3;
  schemaVersion?: number;
  runId: string;
  request: HarnessRequest;
  currentPhase: HarnessPhase;
  lastCompletedPhase?: HarnessPhase | null;
  iteration: number;
  contractLocked: boolean;
  contractHash: string | null;
  contractRound?: number;
  completedContractRounds?: number[];
  incompleteInvocation?: import("./resume").IncompleteInvocation | null;
  canonicalProposalHash?: string | null;
  startCommit: string | null;
  bestCommit: string | null;
  stopReason: string | null;
  failureCategory?: import("./failure").FailureCategory | null;
  isolation: unknown;
  model: unknown;
  phases: Record<HarnessPhase, PhaseRecord>;
  iterations: IterationRecord[];
  updatedAt: string;
};

function defaultPhases(): Record<HarnessPhase, PhaseRecord> {
  return Object.fromEntries(
    HARNESS_PHASES.map((phase) => [phase, emptyPhase(phase)]),
  ) as Record<HarnessPhase, PhaseRecord>;
}

export function machinePath(runRoot: string): string {
  return path.join(runRoot, "machine.json");
}

export function loadMachine(runRoot: string): MachineState | null {
  const file = machinePath(runRoot);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as MachineState;
}

export function createMachine(options: {
  runId: string;
  request: HarnessRequest;
  isolation: unknown;
  model: unknown;
}): MachineState {
  return {
    version: 3,
    schemaVersion: 3,
    runId: options.runId,
    request: options.request,
    currentPhase: "PRECHECK",
    lastCompletedPhase: null,
    iteration: 0,
    contractLocked: false,
    contractHash: null,
    contractRound: 0,
    completedContractRounds: [],
    incompleteInvocation: null,
    canonicalProposalHash: null,
    startCommit: null,
    bestCommit: null,
    stopReason: null,
    failureCategory: null,
    isolation: options.isolation,
    model: options.model,
    phases: defaultPhases(),
    iterations: [],
    updatedAt: nowIso(),
  };
}

export class RunMachine {
  constructor(
    readonly runRoot: string,
    public state: MachineState,
  ) {
    mkdirSync(runRoot, { recursive: true });
  }

  static start(runRoot: string, state: MachineState): RunMachine {
    const machine = new RunMachine(runRoot, state);
    machine.persist();
    return machine;
  }

  static resume(runRoot: string): RunMachine {
    const loaded = loadMachine(runRoot);
    if (!loaded) {
      throw new Error(`No resumable machine state at ${machinePath(runRoot)}`);
    }
    return new RunMachine(runRoot, loaded);
  }

  persist(): void {
    this.state.updatedAt = nowIso();
    writeFileSync(
      machinePath(this.runRoot),
      `${canonicalJson(this.state)}\n`,
      "utf8",
    );
  }

  private slot(phase: HarnessPhase): PhaseRecord {
    if (isLoopPhase(phase) && this.state.iteration > 0) {
      let iter = this.state.iterations.find((row) => row.n === this.state.iteration);
      if (!iter) {
        iter = { n: this.state.iteration, phases: {} };
        this.state.iterations.push(iter);
      }
      if (!iter.phases[phase]) iter.phases[phase] = emptyPhase(phase);
      return iter.phases[phase]!;
    }
    return this.state.phases[phase];
  }

  statusOf(phase: HarnessPhase): PhaseStatus {
    return this.slot(phase).status;
  }

  shouldSkip(phase: HarnessPhase): boolean {
    return this.slot(phase).status === "completed" || this.slot(phase).status === "skipped";
  }

  begin(phase: HarnessPhase, input: unknown = null): PhaseRecord {
    if (this.shouldSkip(phase)) {
      return this.slot(phase);
    }
    this.state.currentPhase = phase;
    const record = this.slot(phase);
    record.status = "in_progress";
    record.startedAt = nowIso();
    record.endedAt = null;
    record.input = input;
    record.result = null;
    record.error = null;
    record.iteration = this.state.iteration || undefined;
    this.persist();
    return record;
  }

  complete(phase: HarnessPhase, result: unknown = null): PhaseRecord {
    const record = this.slot(phase);
    record.status = "completed";
    record.endedAt = nowIso();
    record.result = result;
    record.error = null;
    this.state.lastCompletedPhase = phase;
    this.persist();
    return record;
  }

  skip(phase: HarnessPhase, reason: string): PhaseRecord {
    const record = this.slot(phase);
    record.status = "skipped";
    record.endedAt = nowIso();
    record.result = { reason };
    this.persist();
    return record;
  }

  fail(phase: HarnessPhase, error: string, category?: import("./failure").FailureCategory): PhaseRecord {
    const record = this.slot(phase);
    record.status = "failed";
    record.endedAt = nowIso();
    record.error = error;
    this.state.stopReason = error;
    this.state.failureCategory = category ?? this.state.failureCategory ?? null;
    this.persist();
    return record;
  }

  setIncompleteInvocation(
    invocation: import("./resume").IncompleteInvocation | null,
  ): void {
    this.state.incompleteInvocation = invocation;
    if (invocation) this.state.contractRound = invocation.round;
    this.persist();
  }

  markContractRoundComplete(round: number, hash: string): void {
    const rounds = new Set(this.state.completedContractRounds ?? []);
    rounds.add(round);
    this.state.completedContractRounds = [...rounds].sort((a, b) => a - b);
    this.state.contractRound = round;
    this.state.canonicalProposalHash = hash;
    this.state.incompleteInvocation = null;
    this.persist();
  }

  startIteration(n: number): void {
    this.state.iteration = n;
    if (!this.state.iterations.some((row) => row.n === n)) {
      this.state.iterations.push({ n, phases: {} });
    }
    this.persist();
  }

  reopen(phase: HarnessPhase, reason: string): PhaseRecord {
    const record = this.slot(phase);
    record.status = "pending";
    record.startedAt = null;
    record.endedAt = null;
    record.error = null;
    record.result = { reopened: reason, previous: record.result };
    this.persist();
    return record;
  }

  lockContract(hash: string): void {
    this.state.contractLocked = true;
    this.state.contractHash = hash;
    this.persist();
  }
}
