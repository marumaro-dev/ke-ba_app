import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import {
  featureSnapshots,
  predictionRuns,
  raceEntries,
  racePredictions,
  races,
} from "@/db/schema";
import {
  calculateRuleBasedPredictionScore,
  type PredictionFeatureValue,
} from "./scoring";
import {
  defaultRuleBasedScoringConfig,
  getRuleBasedScoringConfig,
  type RuleBasedScoringConfig,
} from "./scoring-config";

type Database = ReturnType<typeof drizzle<Record<string, never>, postgres.Sql>>;

const predictionType = "rule_based" as const;

export type GeneratePredictionsOptions = {
  db: Database;
  asOfAt: Date;
  dryRun: boolean;
  modelVersion?: string;
};

export type GeneratePredictionsResult = {
  runId: string;
  mode: "dry_run" | "import";
  modelVersion: string;
  asOfAt: Date;
  targetEntries: number;
  calculatedPredictions: number;
  insertedPredictions: number;
  updatedPredictions: number;
};

type PredictionTarget = {
  raceEntryId: string;
  raceId: string;
  horseId: string;
  jockeyId: string | null;
};

type CalculatedPrediction = PredictionTarget & {
  predictionScore: number;
  rankInRace: number;
  scoreComponentsJson: unknown;
  featureSnapshotKeysJson: unknown;
};

export async function generateRuleBasedPredictions({
  db,
  asOfAt,
  dryRun,
  modelVersion: requestedModelVersion,
}: GeneratePredictionsOptions): Promise<GeneratePredictionsResult> {
  const scoringConfig = getRuleBasedScoringConfig(requestedModelVersion);
  const modelVersion = scoringConfig.modelVersion;
  const startedAt = new Date();
  const mode = dryRun ? "dry_run" : "import";
  const [run] = await db
    .insert(predictionRuns)
    .values({
      predictionType,
      modelVersion,
      status: "running",
      mode,
      asOfAt,
      startedAt,
      summaryJson: {},
    })
    .returning({ id: predictionRuns.id });

  try {
    const targets = await getPredictionTargets(db, asOfAt);
    const featuresByEntryId = await getLatestFeaturesByRaceEntryId(
      db,
      targets.map((target) => target.raceEntryId),
      asOfAt,
    );
    const predictions = calculatePredictions(
      targets,
      featuresByEntryId,
      scoringConfig,
    );
    let insertedPredictions = 0;
    let updatedPredictions = 0;

    if (!dryRun) {
      for (const prediction of predictions) {
        const existing = await db
          .select({ id: racePredictions.id })
          .from(racePredictions)
          .where(
            and(
              eq(racePredictions.predictionType, predictionType),
              eq(racePredictions.modelVersion, modelVersion),
              eq(racePredictions.raceEntryId, prediction.raceEntryId),
              eq(racePredictions.asOfAt, asOfAt),
            ),
          )
          .limit(1);

        await db
          .insert(racePredictions)
          .values({
            predictionRunId: run.id,
            predictionType,
            modelVersion,
            raceId: prediction.raceId,
            raceEntryId: prediction.raceEntryId,
            horseId: prediction.horseId,
            jockeyId: prediction.jockeyId,
            asOfAt,
            predictionScore: prediction.predictionScore.toString(),
            rankInRace: prediction.rankInRace,
            scoreComponentsJson: prediction.scoreComponentsJson,
            featureSnapshotKeysJson: prediction.featureSnapshotKeysJson,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              racePredictions.predictionType,
              racePredictions.modelVersion,
              racePredictions.raceEntryId,
              racePredictions.asOfAt,
            ],
            set: {
              predictionRunId: run.id,
              raceId: prediction.raceId,
              horseId: prediction.horseId,
              jockeyId: prediction.jockeyId,
              predictionScore: prediction.predictionScore.toString(),
              rankInRace: prediction.rankInRace,
              scoreComponentsJson: prediction.scoreComponentsJson,
              featureSnapshotKeysJson: prediction.featureSnapshotKeysJson,
              updatedAt: new Date(),
            },
          });

        if (existing.length > 0) {
          updatedPredictions += 1;
        } else {
          insertedPredictions += 1;
        }
      }
    }

    await db
      .update(predictionRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        totalCount: predictions.length,
        successCount: predictions.length,
        failureCount: 0,
        summaryJson: {
          targetEntries: targets.length,
          calculatedPredictions: predictions.length,
          insertedPredictions,
          updatedPredictions,
          dryRun,
          predictionType,
          modelVersion,
          note: "予測スコアは勝率・複勝率ではありません。",
        },
      })
      .where(eq(predictionRuns.id, run.id));

    return {
      runId: run.id,
      mode,
      modelVersion,
      asOfAt,
      targetEntries: targets.length,
      calculatedPredictions: predictions.length,
      insertedPredictions,
      updatedPredictions,
    };
  } catch (error) {
    await db
      .update(predictionRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        failureCount: 1,
        summaryJson: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .where(eq(predictionRuns.id, run.id));

    throw error;
  }
}

async function getPredictionTargets(db: Database, asOfAt: Date) {
  const rows = await db
    .select({
      raceEntryId: raceEntries.id,
      raceId: raceEntries.raceId,
      horseId: raceEntries.horseId,
      jockeyId: raceEntries.jockeyId,
    })
    .from(raceEntries)
    .innerJoin(races, eq(raceEntries.raceId, races.id))
    .where(
      and(
        lte(races.availableAt, asOfAt),
        lte(raceEntries.availableAt, asOfAt),
      ),
    )
    .orderBy(asc(raceEntries.raceId), asc(raceEntries.horseNumber));

  return rows satisfies PredictionTarget[];
}

async function getLatestFeaturesByRaceEntryId(
  db: Database,
  raceEntryIds: string[],
  asOfAt: Date,
) {
  if (raceEntryIds.length === 0) {
    return new Map<string, FeatureSnapshotForPrediction[]>();
  }

  const rows = await db
    .select({
      id: featureSnapshots.id,
      raceEntryId: featureSnapshots.raceEntryId,
      featureKey: featureSnapshots.featureKey,
      featureValueNumber: featureSnapshots.featureValueNumber,
      featureValueBoolean: featureSnapshots.featureValueBoolean,
      asOfAt: featureSnapshots.asOfAt,
    })
    .from(featureSnapshots)
    .where(
      and(
        inArray(featureSnapshots.raceEntryId, raceEntryIds),
        lte(featureSnapshots.asOfAt, asOfAt),
      ),
    )
    .orderBy(
      asc(featureSnapshots.raceEntryId),
      asc(featureSnapshots.featureKey),
      desc(featureSnapshots.asOfAt),
    );
  const latest = new Map<string, FeatureSnapshotForPrediction>();

  for (const row of rows) {
    const key = `${row.raceEntryId}:${row.featureKey}`;

    if (latest.has(key)) {
      continue;
    }

    latest.set(key, {
      id: row.id,
      raceEntryId: row.raceEntryId,
      featureKey: row.featureKey,
      value:
        row.featureValueBoolean ??
        (row.featureValueNumber === null
          ? null
          : Number(row.featureValueNumber)),
      asOfAt: row.asOfAt,
    });
  }

  const byEntryId = new Map<string, FeatureSnapshotForPrediction[]>();

  for (const feature of latest.values()) {
    const features = byEntryId.get(feature.raceEntryId) ?? [];
    features.push(feature);
    byEntryId.set(feature.raceEntryId, features);
  }

  return byEntryId;
}

function calculatePredictions(
  targets: PredictionTarget[],
  featuresByEntryId: Map<string, FeatureSnapshotForPrediction[]>,
  scoringConfig: RuleBasedScoringConfig = defaultRuleBasedScoringConfig,
) {
  const withoutRank = targets.map((target) => {
    const features = featuresByEntryId.get(target.raceEntryId) ?? [];
    const featureMap = new Map(
      features.map((feature) => [feature.featureKey, feature.value]),
    );
    const score = calculateRuleBasedPredictionScore(featureMap, scoringConfig);

    return {
      ...target,
      predictionScore: score.score,
      rankInRace: 0,
      scoreComponentsJson: {
        baseScore: scoringConfig.scoreRange.base,
        modelVersion: scoringConfig.modelVersion,
        components: score.components,
        disclaimer:
          "このスコアは勝率・複勝率ではなく、特徴量に基づく相対評価です。",
      },
      featureSnapshotKeysJson: features.map((feature) => ({
        id: feature.id,
        featureKey: feature.featureKey,
        asOfAt: feature.asOfAt.toISOString(),
      })),
    };
  });
  const byRaceId = new Map<string, CalculatedPrediction[]>();

  for (const prediction of withoutRank) {
    const predictions = byRaceId.get(prediction.raceId) ?? [];
    predictions.push(prediction);
    byRaceId.set(prediction.raceId, predictions);
  }

  for (const predictions of byRaceId.values()) {
    predictions
      .sort((a, b) => b.predictionScore - a.predictionScore)
      .forEach((prediction, index) => {
        prediction.rankInRace = index + 1;
      });
  }

  return withoutRank;
}

type FeatureSnapshotForPrediction = {
  id: string;
  raceEntryId: string;
  featureKey: string;
  value: PredictionFeatureValue;
  asOfAt: Date;
};
