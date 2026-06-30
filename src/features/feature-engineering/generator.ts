import { and, eq, lt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import {
  featureDefinitions,
  featureGenerationBatches,
  featureSnapshots,
  raceEntries,
  raceResults,
  races,
} from "@/db/schema";
import {
  calculatePhase2Features,
  type JockeyPastPerformance,
  type PastPerformance,
  type TargetRaceEntry,
} from "./calculator";
import { phase2FeatureDefinitions } from "./definitions";

type Database = ReturnType<typeof drizzle<Record<string, never>, postgres.Sql>>;

export type GeneratePhase2FeatureOptions = {
  db: Database;
  asOfAt: Date;
  dryRun: boolean;
};

export type GeneratePhase2FeatureResult = {
  batchId: string;
  mode: "dry_run" | "import";
  asOfAt: Date;
  targetEntries: number;
  calculatedSnapshots: number;
  insertedSnapshots: number;
  updatedSnapshots: number;
};

export async function generateP0Features({
  db,
  asOfAt,
  dryRun,
}: GeneratePhase2FeatureOptions): Promise<GeneratePhase2FeatureResult> {
  const generatedAt = new Date();
  const mode = dryRun ? "dry_run" : "import";
  const definitions = await ensurePhase2FeatureDefinitions(db);
  const [batch] = await db
    .insert(featureGenerationBatches)
    .values({
      status: "running",
      mode,
      asOfAt,
      featureVersion: 1,
      startedAt: generatedAt,
      summaryJson: {},
    })
    .returning({ id: featureGenerationBatches.id });

  try {
    const targets = await getTargetRaceEntries(db, asOfAt);
    let calculatedSnapshots = 0;
    let insertedSnapshots = 0;
    let updatedSnapshots = 0;

    for (const target of targets) {
      const pastPerformances = await getPastPerformances(db, target, asOfAt);
      const jockeyPastPerformances = await getJockeyPastPerformances(
        db,
        target,
        asOfAt,
      );
      const features = calculatePhase2Features(
        target,
        pastPerformances,
        asOfAt,
        jockeyPastPerformances,
      );
      calculatedSnapshots += features.length;

      if (dryRun) {
        continue;
      }

      for (const feature of features) {
        const definition = definitions.get(feature.featureKey);

        if (!definition) {
          throw new Error(`Feature definition not found: ${feature.featureKey}`);
        }

        const existing = await db
          .select({ id: featureSnapshots.id })
          .from(featureSnapshots)
          .where(
            and(
              eq(featureSnapshots.featureKey, feature.featureKey),
              eq(featureSnapshots.featureVersion, 1),
              eq(featureSnapshots.raceEntryId, target.raceEntryId),
              eq(featureSnapshots.asOfAt, asOfAt),
            ),
          )
          .limit(1);

        await db
          .insert(featureSnapshots)
          .values({
            featureDefinitionId: definition.id,
            generationBatchId: batch.id,
            raceId: target.raceId,
            raceEntryId: target.raceEntryId,
            horseId: target.horseId,
            jockeyId: target.jockeyId,
            featureKey: feature.featureKey,
            featureVersion: 1,
            asOfAt,
            featureValueNumber:
              feature.valueType === "number" &&
              feature.numberValue !== undefined &&
              feature.numberValue !== null
                ? feature.numberValue.toString()
                : null,
            featureValueBoolean:
              feature.valueType === "boolean" ? feature.booleanValue : null,
            sourceAvailableUntil: feature.sourceAvailableUntil,
            sourceObservedUntil: feature.sourceObservedUntil,
            generatedAt,
            updatedAt: generatedAt,
          })
          .onConflictDoUpdate({
            target: [
              featureSnapshots.featureKey,
              featureSnapshots.featureVersion,
              featureSnapshots.raceEntryId,
              featureSnapshots.asOfAt,
            ],
            set: {
              featureDefinitionId: definition.id,
              generationBatchId: batch.id,
              raceId: target.raceId,
              horseId: target.horseId,
              jockeyId: target.jockeyId,
              featureValueNumber:
                feature.valueType === "number" &&
                feature.numberValue !== undefined &&
                feature.numberValue !== null
                  ? feature.numberValue.toString()
                  : null,
              featureValueBoolean:
                feature.valueType === "boolean" ? feature.booleanValue : null,
              featureValueText: null,
              featureValueJson: null,
              sourceAvailableUntil: feature.sourceAvailableUntil,
              sourceObservedUntil: feature.sourceObservedUntil,
              generatedAt,
              updatedAt: generatedAt,
            },
          });

        if (existing.length > 0) {
          updatedSnapshots += 1;
        } else {
          insertedSnapshots += 1;
        }
      }
    }

    await db
      .update(featureGenerationBatches)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        totalCount: calculatedSnapshots,
        successCount: calculatedSnapshots,
        failureCount: 0,
        summaryJson: {
          targetEntries: targets.length,
          calculatedSnapshots,
          insertedSnapshots,
          updatedSnapshots,
          dryRun,
        },
      })
      .where(eq(featureGenerationBatches.id, batch.id));

    return {
      batchId: batch.id,
      mode,
      asOfAt,
      targetEntries: targets.length,
      calculatedSnapshots,
      insertedSnapshots,
      updatedSnapshots,
    };
  } catch (error) {
    await db
      .update(featureGenerationBatches)
      .set({
        status: "failed",
        finishedAt: new Date(),
        failureCount: 1,
        summaryJson: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .where(eq(featureGenerationBatches.id, batch.id));

    throw error;
  }
}

export async function ensureP0FeatureDefinitions(db: Database) {
  return ensurePhase2FeatureDefinitions(db);
}

export async function ensurePhase2FeatureDefinitions(db: Database) {
  for (const definition of phase2FeatureDefinitions) {
    await db
      .insert(featureDefinitions)
      .values({
        id: definition.id,
        featureKey: definition.featureKey,
        name: definition.name,
        description: definition.description,
        entityType: definition.entityType,
        valueType: definition.valueType,
        version: definition.version,
        calculationLogic: definition.calculationLogic,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [featureDefinitions.featureKey, featureDefinitions.version],
        set: {
          name: definition.name,
          description: definition.description,
          entityType: definition.entityType,
          valueType: definition.valueType,
          isActive: true,
          calculationLogic: definition.calculationLogic,
          updatedAt: new Date(),
        },
      });
  }

  const rows = await db
    .select({
      id: featureDefinitions.id,
      featureKey: featureDefinitions.featureKey,
    })
    .from(featureDefinitions)
    .where(eq(featureDefinitions.version, 1));

  return new Map(rows.map((row) => [row.featureKey, row]));
}

async function getTargetRaceEntries(db: Database, asOfAt: Date) {
  const rows = await db
    .select({
      raceEntryId: raceEntries.id,
      raceId: races.id,
      horseId: raceEntries.horseId,
      jockeyId: raceEntries.jockeyId,
      raceDate: races.raceDate,
      scheduledStartAt: races.scheduledStartAt,
      venue: races.venue,
      surface: races.surface,
      distanceMeters: races.distanceMeters,
      trackCondition: races.trackCondition,
    })
    .from(raceEntries)
    .innerJoin(races, eq(raceEntries.raceId, races.id))
    .where(
      and(
        lte(races.availableAt, asOfAt),
        lte(raceEntries.availableAt, asOfAt),
      ),
    );

  return rows satisfies TargetRaceEntry[];
}

async function getPastPerformances(
  db: Database,
  target: TargetRaceEntry,
  asOfAt: Date,
) {
  const rows = await db
    .select({
      raceDate: races.raceDate,
      scheduledStartAt: races.scheduledStartAt,
      venue: races.venue,
      surface: races.surface,
      distanceMeters: races.distanceMeters,
      trackCondition: races.trackCondition,
      finishPosition: raceResults.finishPosition,
      finishStatus: raceResults.finishStatus,
      finishTimeMilliseconds: raceResults.finishTimeMilliseconds,
      resultAvailableAt: raceResults.availableAt,
      resultObservedAt: raceResults.observedAt,
    })
    .from(raceEntries)
    .innerJoin(races, eq(raceEntries.raceId, races.id))
    .innerJoin(raceResults, eq(raceEntries.id, raceResults.raceEntryId))
    .where(
      and(
        eq(raceEntries.horseId, target.horseId),
        lt(races.scheduledStartAt, target.scheduledStartAt),
        lte(races.availableAt, asOfAt),
        lte(raceEntries.availableAt, asOfAt),
        lte(raceResults.availableAt, asOfAt),
      ),
    );

  return rows satisfies PastPerformance[];
}

async function getJockeyPastPerformances(
  db: Database,
  target: TargetRaceEntry,
  asOfAt: Date,
) {
  if (!target.jockeyId) {
    return [] satisfies JockeyPastPerformance[];
  }

  const rows = await db
    .select({
      raceDate: races.raceDate,
      scheduledStartAt: races.scheduledStartAt,
      venue: races.venue,
      surface: races.surface,
      distanceMeters: races.distanceMeters,
      trackCondition: races.trackCondition,
      finishPosition: raceResults.finishPosition,
      finishStatus: raceResults.finishStatus,
      finishTimeMilliseconds: raceResults.finishTimeMilliseconds,
      resultAvailableAt: raceResults.availableAt,
      resultObservedAt: raceResults.observedAt,
    })
    .from(raceEntries)
    .innerJoin(races, eq(raceEntries.raceId, races.id))
    .innerJoin(raceResults, eq(raceEntries.id, raceResults.raceEntryId))
    .where(
      and(
        eq(raceEntries.jockeyId, target.jockeyId),
        lt(races.scheduledStartAt, target.scheduledStartAt),
        lte(races.availableAt, asOfAt),
        lte(raceEntries.availableAt, asOfAt),
        lte(raceResults.availableAt, asOfAt),
      ),
    );

  return rows satisfies JockeyPastPerformance[];
}
