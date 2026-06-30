import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import {
  horses,
  jockeys,
  predictionEvaluations,
  predictionRuns,
  raceEntries,
  racePredictions,
  races,
} from "@/db/schema";
import {
  predictionRunListPageSize,
  type PredictionAnalyticsSearchParams,
  type PredictionRunListSearchParams,
} from "./schemas";
import { calculatePredictionAnalytics } from "./analytics";

export async function listPredictionRuns(
  params: PredictionRunListSearchParams,
) {
  const db = getDb();
  const conditions = [];
  const offset = (params.page - 1) * predictionRunListPageSize;

  if (params.status !== "all") {
    conditions.push(eq(predictionRuns.status, params.status));
  }

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(predictionRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(predictionRuns.startedAt))
      .limit(predictionRunListPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(predictionRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const totalCount = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / predictionRunListPageSize),
  );

  const evaluationCounts = await Promise.all(
    items.map(async (run) => {
      const rows = await db
        .select({ value: count() })
        .from(predictionEvaluations)
        .where(eq(predictionEvaluations.predictionRunId, run.id));

      return [run.id, rows[0]?.value ?? 0] as const;
    }),
  );
  const evaluationCountByRunId = new Map(evaluationCounts);

  return {
    items: items.map((run) => ({
      ...run,
      evaluationCount: evaluationCountByRunId.get(run.id) ?? 0,
    })),
    page: params.page,
    pageSize: predictionRunListPageSize,
    totalCount,
    totalPages,
  };
}

export async function getPredictionRunDetail(runId: string) {
  const db = getDb();

  const [run] = await db
    .select()
    .from(predictionRuns)
    .where(eq(predictionRuns.id, runId))
    .limit(1);

  if (!run) {
    return null;
  }

  const [predictionCount, evaluationCount, raceCount, predictions] = await Promise.all([
    db
      .select({ value: count() })
      .from(racePredictions)
      .where(eq(racePredictions.predictionRunId, runId)),
    db
      .select({ value: count() })
      .from(predictionEvaluations)
      .where(eq(predictionEvaluations.predictionRunId, runId)),
    db
      .selectDistinct({ raceId: racePredictions.raceId })
      .from(racePredictions)
      .where(eq(racePredictions.predictionRunId, runId)),
    db
      .select({
        id: racePredictions.id,
        raceId: racePredictions.raceId,
        raceName: races.name,
        raceDate: races.raceDate,
        venue: races.venue,
        raceNumber: races.raceNumber,
        raceEntryId: racePredictions.raceEntryId,
        horseNumber: raceEntries.horseNumber,
        horseName: horses.name,
        jockeyName: jockeys.name,
        predictionScore: racePredictions.predictionScore,
        rankInRace: racePredictions.rankInRace,
        scoreComponentsJson: racePredictions.scoreComponentsJson,
        finishPosition: predictionEvaluations.finishPosition,
        finishStatus: predictionEvaluations.finishStatus,
        isPredictedTop1: predictionEvaluations.isPredictedTop1,
        topPredictionFinishPosition:
          predictionEvaluations.topPredictionFinishPosition,
        topPredictionIsTop3: predictionEvaluations.topPredictionIsTop3,
        isActualWinner: predictionEvaluations.isActualWinner,
        actualWinnerInPredictedTop3:
          predictionEvaluations.actualWinnerInPredictedTop3,
        rankDiff: predictionEvaluations.rankDiff,
        evaluatedAt: predictionEvaluations.evaluatedAt,
      })
      .from(racePredictions)
      .innerJoin(races, eq(racePredictions.raceId, races.id))
      .innerJoin(raceEntries, eq(racePredictions.raceEntryId, raceEntries.id))
      .innerJoin(horses, eq(racePredictions.horseId, horses.id))
      .leftJoin(jockeys, eq(racePredictions.jockeyId, jockeys.id))
      .leftJoin(
        predictionEvaluations,
        eq(racePredictions.id, predictionEvaluations.racePredictionId),
      )
      .where(eq(racePredictions.predictionRunId, runId))
      .orderBy(
        asc(races.raceDate),
        asc(races.raceNumber),
        asc(racePredictions.rankInRace),
      ),
  ]);

  return {
    run,
    predictionCount: predictionCount[0]?.value ?? 0,
    evaluationCount: evaluationCount[0]?.value ?? 0,
    targetRaceCount: raceCount.length,
    predictions,
  };
}

export async function getPredictionAnalytics(
  params: PredictionAnalyticsSearchParams,
) {
  const db = getDb();
  const conditions = [];

  if (params.modelVersion !== "all") {
    conditions.push(eq(predictionRuns.modelVersion, params.modelVersion));
  }

  if (params.asOfDate) {
    const from = new Date(`${params.asOfDate}T00:00:00+09:00`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    conditions.push(gte(predictionRuns.asOfAt, from));
    conditions.push(lt(predictionRuns.asOfAt, to));
  }

  if (params.evaluationStatus === "evaluated") {
    conditions.push(isNotNull(predictionEvaluations.id));
  } else if (params.evaluationStatus === "unevaluated") {
    conditions.push(isNull(predictionEvaluations.id));
  }

  const [rows, modelVersions] = await Promise.all([
    db
      .select({
        predictionRunId: predictionRuns.id,
        modelVersion: predictionRuns.modelVersion,
        raceId: racePredictions.raceId,
        racePredictionId: racePredictions.id,
        rankInRace: racePredictions.rankInRace,
        rankDiff: predictionEvaluations.rankDiff,
        isPredictedTop1: predictionEvaluations.isPredictedTop1,
        topPredictionIsTop3: predictionEvaluations.topPredictionIsTop3,
        actualWinnerInPredictedTop3:
          predictionEvaluations.actualWinnerInPredictedTop3,
        scoreComponentsJson: racePredictions.scoreComponentsJson,
      })
      .from(racePredictions)
      .innerJoin(
        predictionRuns,
        eq(racePredictions.predictionRunId, predictionRuns.id),
      )
      .leftJoin(
        predictionEvaluations,
        eq(racePredictions.id, predictionEvaluations.racePredictionId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        asc(predictionRuns.modelVersion),
        asc(racePredictions.raceId),
        asc(racePredictions.rankInRace),
      ),
    db
      .selectDistinct({ modelVersion: predictionRuns.modelVersion })
      .from(predictionRuns)
      .orderBy(asc(predictionRuns.modelVersion)),
  ]);

  return {
    summary: calculatePredictionAnalytics(rows),
    modelVersions: modelVersions.map(row => row.modelVersion),
  };
}
