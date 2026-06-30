import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  horses,
  featureSnapshots,
  jockeys,
  raceEntries,
  racePredictions,
  raceResults,
  races,
  trainers,
} from "@/db/schema";
import { phase2FeatureDefinitions } from "@/features/feature-engineering/definitions";
import { raceListPageSize, type RaceListSearchParams } from "./schemas";

export async function listRaces(params: RaceListSearchParams) {
  const db = getDb();
  const conditions = buildRaceListConditions(params);
  const offset = (params.page - 1) * raceListPageSize;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: races.id,
        raceDate: races.raceDate,
        venue: races.venue,
        raceNumber: races.raceNumber,
        name: races.name,
        scheduledStartAt: races.scheduledStartAt,
        surface: races.surface,
        distanceMeters: races.distanceMeters,
        status: races.status,
        observedAt: races.observedAt,
      })
      .from(races)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(races.scheduledStartAt), asc(races.raceNumber))
      .limit(raceListPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(races)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const totalCount = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / raceListPageSize));

  return {
    items,
    page: params.page,
    pageSize: raceListPageSize,
    totalCount,
    totalPages,
  };
}

export async function getRaceFilterOptions() {
  const db = getDb();
  const [raceDates, venues] = await Promise.all([
    db
      .selectDistinct({ value: races.raceDate })
      .from(races)
      .orderBy(asc(races.raceDate)),
    db
      .selectDistinct({ value: races.venue })
      .from(races)
      .orderBy(asc(races.venue)),
  ]);

  return {
    raceDates: raceDates.map((row) => row.value),
    venues: venues.map((row) => row.value),
  };
}

export async function getRaceDetail(raceId: string) {
  const db = getDb();

  const [race] = await db
    .select()
    .from(races)
    .where(eq(races.id, raceId))
    .limit(1);

  if (!race) {
    return null;
  }

  const entries = await db
    .select({
      id: raceEntries.id,
      frameNumber: raceEntries.frameNumber,
      horseNumber: raceEntries.horseNumber,
      assignedWeight: raceEntries.assignedWeight,
      bodyWeight: raceEntries.bodyWeight,
      bodyWeightDiff: raceEntries.bodyWeightDiff,
      entryStatus: raceEntries.status,
      availableAt: raceEntries.availableAt,
      horseName: horses.name,
      horseSex: horses.sex,
      jockeyName: jockeys.name,
      trainerName: trainers.name,
      trainerAffiliation: trainers.affiliation,
      finishPosition: raceResults.finishPosition,
      finishStatus: raceResults.finishStatus,
      finishTimeMilliseconds: raceResults.finishTimeMilliseconds,
      finalOdds: raceResults.finalOdds,
      resultStatus: raceResults.status,
    })
    .from(raceEntries)
    .innerJoin(horses, eq(raceEntries.horseId, horses.id))
    .innerJoin(jockeys, eq(raceEntries.jockeyId, jockeys.id))
    .innerJoin(trainers, eq(raceEntries.trainerId, trainers.id))
    .leftJoin(raceResults, eq(raceEntries.id, raceResults.raceEntryId))
    .where(eq(raceEntries.raceId, raceId))
    .orderBy(asc(raceEntries.horseNumber));

  const featuresByEntryId = await getLatestPhase2FeaturesByEntryId(
    entries.map((entry) => entry.id),
  );
  const predictionsByEntryId = await getLatestPredictionsByEntryId(
    entries.map((entry) => entry.id),
  );

  return {
    race,
    entries: entries.map((entry) => ({
      ...entry,
      features: featuresByEntryId.get(entry.id) ?? [],
      prediction: predictionsByEntryId.get(entry.id) ?? null,
    })),
  };
}

async function getLatestPredictionsByEntryId(raceEntryIds: string[]) {
  if (raceEntryIds.length === 0) {
    return new Map<string, RaceEntryPrediction>();
  }

  const db = getDb();
  const rows = await db
    .select({
      raceEntryId: racePredictions.raceEntryId,
      predictionScore: racePredictions.predictionScore,
      rankInRace: racePredictions.rankInRace,
      asOfAt: racePredictions.asOfAt,
      scoreComponentsJson: racePredictions.scoreComponentsJson,
    })
    .from(racePredictions)
    .where(inArray(racePredictions.raceEntryId, raceEntryIds))
    .orderBy(
      asc(racePredictions.raceEntryId),
      desc(racePredictions.asOfAt),
    );
  const byEntryId = new Map<string, RaceEntryPrediction>();

  for (const row of rows) {
    if (byEntryId.has(row.raceEntryId)) {
      continue;
    }

    byEntryId.set(row.raceEntryId, {
      predictionScore: Number(row.predictionScore),
      rankInRace: row.rankInRace,
      asOfAt: row.asOfAt,
      scoreComponentsJson: row.scoreComponentsJson,
    });
  }

  return byEntryId;
}

async function getLatestPhase2FeaturesByEntryId(raceEntryIds: string[]) {
  if (raceEntryIds.length === 0) {
    return new Map<string, RaceEntryFeature[]>();
  }

  const db = getDb();
  const phase2FeatureKeys = phase2FeatureDefinitions.map(
    (definition) => definition.featureKey,
  );
  const rows = await db
    .select({
      raceEntryId: featureSnapshots.raceEntryId,
      featureKey: featureSnapshots.featureKey,
      featureValueNumber: featureSnapshots.featureValueNumber,
      featureValueBoolean: featureSnapshots.featureValueBoolean,
      asOfAt: featureSnapshots.asOfAt,
      generatedAt: featureSnapshots.generatedAt,
    })
    .from(featureSnapshots)
    .where(
      and(
        inArray(featureSnapshots.raceEntryId, raceEntryIds),
        inArray(featureSnapshots.featureKey, phase2FeatureKeys),
      ),
    )
    .orderBy(
      asc(featureSnapshots.raceEntryId),
      asc(featureSnapshots.featureKey),
      desc(featureSnapshots.asOfAt),
    );
  const latestByKey = new Map<string, RaceEntryFeature>();

  for (const row of rows) {
    const key = `${row.raceEntryId}:${row.featureKey}`;

    if (latestByKey.has(key)) {
      continue;
    }

    latestByKey.set(key, {
      featureKey: row.featureKey,
      value:
        row.featureValueBoolean ??
        (row.featureValueNumber === null
          ? null
          : Number(row.featureValueNumber)),
      asOfAt: row.asOfAt,
      generatedAt: row.generatedAt,
    });
  }

  const byEntryId = new Map<string, RaceEntryFeature[]>();

  for (const [key, feature] of latestByKey) {
    const [raceEntryId] = key.split(":");
    const features = byEntryId.get(raceEntryId) ?? [];
    features.push(feature);
    byEntryId.set(raceEntryId, features);
  }

  return byEntryId;
}

export type RaceEntryFeature = {
  featureKey: string;
  value: number | boolean | null;
  asOfAt: Date;
  generatedAt: Date;
};

export type RaceEntryPrediction = {
  predictionScore: number;
  rankInRace: number | null;
  asOfAt: Date;
  scoreComponentsJson: unknown;
};

function buildRaceListConditions(params: RaceListSearchParams) {
  const conditions = [];

  if (params.raceDate) {
    conditions.push(eq(races.raceDate, params.raceDate));
  }

  if (params.venue) {
    conditions.push(eq(races.venue, params.venue));
  }

  if (params.surface === "turf") {
    conditions.push(ilike(races.surface, "%芝%"));
  }

  if (params.surface === "dirt") {
    conditions.push(ilike(races.surface, "%ダート%"));
  }

  return conditions;
}
