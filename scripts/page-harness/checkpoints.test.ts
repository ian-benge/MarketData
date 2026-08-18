import { describe, expect, it } from "vitest";
import {
  compareCheckpointRanks,
  pickBestCheckpoint,
  shouldRestoreBaseline,
  type CheckpointRank,
} from "./checkpoints";

function rank(partial: Partial<CheckpointRank>): CheckpointRank {
  return {
    commit: "c",
    iteration: 1,
    completeRequiredPass: false,
    severeWarningCount: 0,
    performanceScore: 100,
    dataCorrectnessScore: 1,
    regressionCount: 0,
    diffSize: 10,
    evaluationScore: 50,
    ...partial,
  };
}

describe("checkpoint ranking", () => {
  it("ranks a complete required-gate pass above every incomplete checkpoint", () => {
    const incomplete = rank({ commit: "bad", evaluationScore: 99, completeRequiredPass: false });
    const complete = rank({
      commit: "good",
      evaluationScore: 70,
      completeRequiredPass: true,
      diffSize: 40,
    });
    expect(compareCheckpointRanks(incomplete, complete)).toBeLessThan(0);
    expect(pickBestCheckpoint([incomplete, complete])?.commit).toBe("good");
  });

  it("restores baseline when nothing fully passed", () => {
    expect(shouldRestoreBaseline(rank({ completeRequiredPass: false }))).toBe(true);
    expect(shouldRestoreBaseline(rank({ completeRequiredPass: true }))).toBe(false);
    expect(shouldRestoreBaseline(null)).toBe(true);
  });
});
