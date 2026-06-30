import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import {
  predictionEvaluations,
  predictionRuns,
  racePredictions,
  raceResults,
} from "@/db/schema";
import {
  calculateEvaluations,
  type PredictionWithResultForEvaluation,
} from "./evaluation-calculator";

type Database = ReturnType<typeof drizzle<Record<string, never>, postgres.Sql>>;

export type EvaluatePredictionsOptions = {
  db: Database;
  dryRun: boolean;
  predictionRunId?: string;
};

export type EvaluatePredictionsResult = {
  evaluatedAt: Date;
  targetRuns: number;
  targetPredictions: number;
  calculatedEvaluations: number;
  insertedEvaluations: number;
  updatedEvaluations: number;
  skippedPredictions: number;
};

export async function evaluatePredictions({
  db,
  dryRun,
  predictionRunId,
}: EvaluatePredictionsOptions): Promise<EvaluatePredictionsResult> {
  const evaluatedAt = new Date();
  const predictions = await getPredictionsWithResults(db, predictionRunId);
  const evaluations = calculateEvaluations(predictions);
  let insertedEvaluations = 0;
  let updatedEvaluations = 0;

  if (!dryRun) {
    for (const evaluation of evaluations) {
      const existing = await db
        .select({ id: predictionEvaluations.id })
        .from(predictionEvaluations)
        .where(
          eq(
            predictionEvaluations.racePredictionId,
            evaluation.racePredictionId,
          ),
        )
        .limit(1);

      await db
        .insert(predictionEvaluations)
        .values({
          predictionRunId: evaluation.predictionRunId,
          racePredictionId: evaluation.racePredictionId,
          raceId: evaluation.raceId,
          raceEntryId: evaluation.raceEntryId,
          predictedRank: evaluation.predictedRank,
          predictionScore: evaluation.predictionScore,
          finishPosition: evaluation.finishPosition,
          finishStatus: evaluation.finishStatus,
          isPredictedTop1: evaluation.isPredictedTop1,
          topPredictionFinishPosition: evaluation.topPredictionFinishPosition,
          topPredictionIsTop3: evaluation.topPredictionIsTop3,
          isActualWinner: evaluation.isActualWinner,
          actualWinnerInPredictedTop3: evaluation.actualWinnerInPredictedTop3,
          rankDiff: evaluation.rankDiff,
          resultAvailableAt: evaluation.resultAvailableAt,
          evaluatedAt,
          summaryJson: evaluation.summaryJson,
          updatedAt: evaluatedAt,
        })
        .onConflictDoUpdate({
          target: [predictionEvaluations.racePredictionId],
          set: {
            predictedRank: evaluation.predictedRank,
            predictionScore: evaluation.predictionScore,
            finishPosition: evaluation.finishPosition,
            finishStatus: evaluation.finishStatus,
            isPredictedTop1: evaluation.isPredictedTop1,
            topPredictionFinishPosition: evaluation.topPredictionFinishPosition,
            topPredictionIsTop3: evaluation.topPredictionIsTop3,
            isActualWinner: evaluation.isActualWinner,
            actualWinnerInPredictedTop3: evaluation.actualWinnerInPredictedTop3,
            rankDiff: evaluation.rankDiff,
            resultAvailableAt: evaluation.resultAvailableAt,
            evaluatedAt,
            summaryJson: evaluation.summaryJson,
            updatedAt: evaluatedAt,
          },
        });

      if (existing.length > 0) {
        updatedEvaluations += 1;
      } else {
        insertedEvaluations += 1;
      }
    }
  }

  return {
    evaluatedAt,
    targetRuns: new Set(predictions.map((prediction) => prediction.predictionRunId))
      .size,
    targetPredictions: predictions.length,
    calculatedEvaluations: evaluations.length,
    insertedEvaluations,
    updatedEvaluations,
    skippedPredictions: predictions.length - evaluations.length,
  };
}

async function getPredictionsWithResults(
  db: Database,
  predictionRunId: string | undefined,
) {
  const conditions = predictionRunId
    ? [eq(racePredictions.predictionRunId, predictionRunId)]
    : [eq(predictionRuns.status, "succeeded")];
  const rows = await db
    .select({
      predictionId: racePredictions.id,
      predictionRunId: racePredictions.predictionRunId,
      raceId: racePredictions.raceId,
      raceEntryId: racePredictions.raceEntryId,
      predictedRank: racePredictions.rankInRace,
      predictionScore: racePredictions.predictionScore,
      finishPosition: raceResults.finishPosition,
      finishStatus: raceResults.finishStatus,
      resultAvailableAt: raceResults.availableAt,
    })
    .from(racePredictions)
    .innerJoin(
      predictionRuns,
      eq(racePredictions.predictionRunId, predictionRuns.id),
    )
    .innerJoin(raceResults, eq(racePredictions.raceEntryId, raceResults.raceEntryId))
    .where(and(...conditions))
    .orderBy(
      asc(racePredictions.predictionRunId),
      asc(racePredictions.raceId),
      asc(racePredictions.rankInRace),
    );

  return rows satisfies PredictionWithResultForEvaluation[];
}
