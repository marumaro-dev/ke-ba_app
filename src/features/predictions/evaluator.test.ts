import { describe, expect, it } from "vitest";

import { calculateEvaluations } from "./evaluation-calculator";

describe("prediction evaluator", () => {
  it("calculates race-level and entry-level evaluation metrics", () => {
    const evaluations = calculateEvaluations([
      prediction({ id: "p1", entryId: "e1", predictedRank: 1, finish: 2 }),
      prediction({ id: "p2", entryId: "e2", predictedRank: 2, finish: 1 }),
      prediction({ id: "p3", entryId: "e3", predictedRank: 3, finish: 5 }),
    ]);

    const top = evaluations.find((evaluation) => evaluation.isPredictedTop1);
    const winner = evaluations.find((evaluation) => evaluation.isActualWinner);

    expect(top?.topPredictionFinishPosition).toBe(2);
    expect(top?.topPredictionIsTop3).toBe(true);
    expect(top?.actualWinnerInPredictedTop3).toBe(true);
    expect(winner?.rankDiff).toBe(1);
  });
});

function prediction({
  entryId,
  finish,
  id,
  predictedRank,
}: {
  entryId: string;
  finish: number;
  id: string;
  predictedRank: number;
}) {
  return {
    predictionId: id,
    predictionRunId: "run-1",
    raceId: "race-1",
    raceEntryId: entryId,
    predictedRank,
    predictionScore: "50.000",
    finishPosition: finish,
    finishStatus: "finished" as const,
    resultAvailableAt: new Date("2026-06-29T16:00:00+09:00"),
  };
}
