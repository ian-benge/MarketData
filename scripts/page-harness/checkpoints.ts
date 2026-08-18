export type CheckpointRank = {
  commit: string;
  iteration: number;
  completeRequiredPass: boolean;
  severeWarningCount: number;
  performanceScore: number;
  dataCorrectnessScore: number;
  regressionCount: number;
  diffSize: number;
  evaluationScore: number;
};

export function compareCheckpointRanks(a: CheckpointRank, b: CheckpointRank): number {
  if (a.completeRequiredPass !== b.completeRequiredPass) {
    return a.completeRequiredPass ? 1 : -1;
  }
  if (a.severeWarningCount !== b.severeWarningCount) {
    return b.severeWarningCount - a.severeWarningCount;
  }
  if (a.performanceScore !== b.performanceScore) {
    return a.performanceScore - b.performanceScore;
  }
  if (a.dataCorrectnessScore !== b.dataCorrectnessScore) {
    return a.dataCorrectnessScore - b.dataCorrectnessScore;
  }
  if (a.regressionCount !== b.regressionCount) {
    return b.regressionCount - a.regressionCount;
  }
  if (a.diffSize !== b.diffSize) {
    return b.diffSize - a.diffSize;
  }
  return a.evaluationScore - b.evaluationScore;
}

export function pickBestCheckpoint(ranks: CheckpointRank[]): CheckpointRank | null {
  if (ranks.length === 0) return null;
  return [...ranks].sort(compareCheckpointRanks).at(-1) ?? null;
}

export function shouldRestoreBaseline(best: CheckpointRank | null): boolean {
  return !best || !best.completeRequiredPass;
}
