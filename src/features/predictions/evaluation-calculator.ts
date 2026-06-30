export type PredictionWithResultForEvaluation = {
  predictionId: string;
  predictionRunId: string;
  raceId: string;
  raceEntryId: string;
  predictedRank: number | null;
  predictionScore: string;
  finishPosition: number | null;
  finishStatus: "finished" | "did_not_finish" | "disqualified" | "scratched";
  resultAvailableAt: Date;
};

export type CalculatedPredictionEvaluation = {
  predictionRunId: string;
  racePredictionId: string;
  raceId: string;
  raceEntryId: string;
  predictedRank: number | null;
  predictionScore: string;
  finishPosition: number | null;
  finishStatus: "finished" | "did_not_finish" | "disqualified" | "scratched";
  isPredictedTop1: boolean;
  topPredictionFinishPosition: number | null;
  topPredictionIsTop3: boolean | null;
  isActualWinner: boolean;
  actualWinnerInPredictedTop3: boolean;
  rankDiff: number | null;
  resultAvailableAt: Date;
  summaryJson: unknown;
};

export function calculateEvaluations(
  predictions: PredictionWithResultForEvaluation[],
): CalculatedPredictionEvaluation[] {
  const byRunAndRace = new Map<string, PredictionWithResultForEvaluation[]>();

  for (const prediction of predictions) {
    const key = `${prediction.predictionRunId}:${prediction.raceId}`;
    const racePredictions = byRunAndRace.get(key) ?? [];
    racePredictions.push(prediction);
    byRunAndRace.set(key, racePredictions);
  }

  return Array.from(byRunAndRace.values()).flatMap((racePredictions) =>
    calculateRaceEvaluations(racePredictions),
  );
}

function calculateRaceEvaluations(
  predictions: PredictionWithResultForEvaluation[],
): CalculatedPredictionEvaluation[] {
  const ranked = [...predictions].sort(
    (a, b) => (a.predictedRank ?? 999) - (b.predictedRank ?? 999),
  );
  const topPrediction = ranked[0];
  const actualWinner = predictions.find(
    (prediction) => prediction.finishPosition === 1,
  );

  if (!topPrediction) {
    return [];
  }

  const actualWinnerInPredictedTop3 = actualWinner
    ? ranked
        .slice(0, 3)
        .some((prediction) => prediction.raceEntryId === actualWinner.raceEntryId)
    : false;
  const topPredictionFinishPosition = topPrediction.finishPosition;
  const topPredictionIsTop3 =
    topPredictionFinishPosition === null
      ? null
      : topPredictionFinishPosition <= 3;

  return predictions.map((prediction) => {
    const rankDiff =
      prediction.predictedRank === null || prediction.finishPosition === null
        ? null
        : Math.abs(prediction.predictedRank - prediction.finishPosition);

    return {
      predictionRunId: prediction.predictionRunId,
      racePredictionId: prediction.predictionId,
      raceId: prediction.raceId,
      raceEntryId: prediction.raceEntryId,
      predictedRank: prediction.predictedRank,
      predictionScore: prediction.predictionScore,
      finishPosition: prediction.finishPosition,
      finishStatus: prediction.finishStatus,
      isPredictedTop1: prediction.raceEntryId === topPrediction.raceEntryId,
      topPredictionFinishPosition,
      topPredictionIsTop3,
      isActualWinner: prediction.finishPosition === 1,
      actualWinnerInPredictedTop3,
      rankDiff,
      resultAvailableAt: prediction.resultAvailableAt,
      summaryJson: {
        topPredictionRaceEntryId: topPrediction.raceEntryId,
        actualWinnerRaceEntryId: actualWinner?.raceEntryId ?? null,
        topPredictionFinishPosition,
        topPredictionIsTop3,
        actualWinnerInPredictedTop3,
        rankDiff,
      },
    };
  });
}
