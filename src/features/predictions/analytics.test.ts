import { describe, expect, it } from "vitest";

import { calculatePredictionAnalytics } from "./analytics";
import type { PredictionAnalyticsRow } from "./analytics";

describe("prediction analytics", () => {
  it("calculates evaluation metrics by model version", () => {
    const summary = calculatePredictionAnalytics([
      row({
        modelVersion: "rule-based-v1",
        predictionRunId: "run-1",
        raceId: "race-1",
        racePredictionId: "prediction-1",
        rankInRace: 1,
        rankDiff: 1,
        isPredictedTop1: true,
        topPredictionIsTop3: true,
        actualWinnerInPredictedTop3: true,
      }),
      row({
        modelVersion: "rule-based-v1",
        predictionRunId: "run-1",
        raceId: "race-1",
        racePredictionId: "prediction-2",
        rankInRace: 2,
        rankDiff: 1,
      }),
      row({
        modelVersion: "rule-based-v1.1",
        predictionRunId: "run-2",
        raceId: "race-2",
        racePredictionId: "prediction-3",
        rankInRace: 1,
        rankDiff: 4,
        isPredictedTop1: true,
        topPredictionIsTop3: false,
        actualWinnerInPredictedTop3: false,
      }),
    ]);

    expect(summary.evaluatedRaceCount).toBe(2);
    expect(summary.top1Top3Rate).toBe(0.5);
    expect(summary.winnerInPredictedTop3Rate).toBe(0.5);
    expect(summary.averageRankDiff).toBe(2);
    expect(summary.modelVersionSummaries).toEqual([
      expect.objectContaining({
        modelVersion: "rule-based-v1",
        evaluatedRaceCount: 1,
        top1Top3Rate: 1,
        isSmallSample: true,
      }),
      expect.objectContaining({
        modelVersion: "rule-based-v1.1",
        evaluatedRaceCount: 1,
        top1Top3Rate: 0,
      }),
    ]);
    expect(summary.modelVersionComparison).toEqual(
      expect.objectContaining({
        baseModelVersion: "rule-based-v1",
        candidateModelVersion: "rule-based-v1.1",
        evaluatedRaceCountDiff: 0,
        evaluatedPredictionCountDiff: -1,
        top1Top3RateDiff: -1,
        winnerInPredictedTop3RateDiff: -1,
        averageRankDiffDiff: 3,
        isSmallSample: true,
      }),
    );
  });

  it("summarizes feature contribution averages", () => {
    const summary = calculatePredictionAnalytics([
      row({
        racePredictionId: "prediction-1",
        scoreComponentsJson: {
          components: [
            {
              key: "horse.surface_top3_rate",
              label: "同馬場区分3着内率",
              adjustment: 2,
            },
            {
              key: "jockey.venue_win_rate",
              label: "騎手・同競馬場勝率",
              adjustment: -1,
            },
          ],
        },
      }),
      row({
        racePredictionId: "prediction-2",
        scoreComponentsJson: {
          components: [
            {
              key: "horse.surface_top3_rate",
              label: "同馬場区分3着内率",
              adjustment: 4,
            },
          ],
        },
      }),
    ]);

    expect(summary.featureContributionSummaries).toEqual([
      expect.objectContaining({
        featureKey: "horse.surface_top3_rate",
        count: 2,
        positiveCount: 2,
        negativeCount: 0,
        averageAdjustment: 3,
      }),
      expect.objectContaining({
        featureKey: "jockey.venue_win_rate",
        count: 1,
        positiveCount: 0,
        negativeCount: 1,
        averageAdjustment: -1,
      }),
    ]);
  });

  it("compares feature contribution averages by model version", () => {
    const summary = calculatePredictionAnalytics([
      row({
        modelVersion: "rule-based-v1",
        racePredictionId: "prediction-1",
        scoreComponentsJson: {
          components: [
            {
              key: "horse.surface_top3_rate",
              label: "同馬場区分3着内率",
              adjustment: 4,
            },
          ],
        },
      }),
      row({
        modelVersion: "rule-based-v1.1",
        predictionRunId: "run-2",
        racePredictionId: "prediction-2",
        scoreComponentsJson: {
          components: [
            {
              key: "horse.surface_top3_rate",
              label: "同馬場区分3着内率",
              adjustment: 3,
            },
          ],
        },
      }),
    ]);

    expect(summary.featureContributionComparisons).toEqual([
      expect.objectContaining({
        featureKey: "horse.surface_top3_rate",
        averageAdjustmentDiff: -1,
        byModelVersion: [
          expect.objectContaining({
            modelVersion: "rule-based-v1",
            averageAdjustment: 4,
          }),
          expect.objectContaining({
            modelVersion: "rule-based-v1.1",
            averageAdjustment: 3,
          }),
        ],
      }),
    ]);
  });
});

function row(
  overrides: Partial<PredictionAnalyticsRow> = {},
): PredictionAnalyticsRow {
  return {
    predictionRunId: "run-1",
    modelVersion: "rule-based-v1",
    raceId: "race-1",
    racePredictionId: "prediction-1",
    rankInRace: null,
    rankDiff: null,
    isPredictedTop1: null,
    topPredictionIsTop3: null,
    actualWinnerInPredictedTop3: null,
    scoreComponentsJson: { components: [] },
    ...overrides,
  };
}
