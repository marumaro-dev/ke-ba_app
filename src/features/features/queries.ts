import { and, asc, count, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { featureGenerationBatches, featureSnapshots } from "@/db/schema";
import {
  featureBatchListPageSize,
  type FeatureBatchListSearchParams,
} from "./schemas";

export async function listFeatureGenerationBatches(
  params: FeatureBatchListSearchParams,
) {
  const db = getDb();
  const conditions = [];
  const offset = (params.page - 1) * featureBatchListPageSize;

  if (params.status !== "all") {
    conditions.push(eq(featureGenerationBatches.status, params.status));
  }

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(featureGenerationBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(featureGenerationBatches.startedAt))
      .limit(featureBatchListPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(featureGenerationBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const totalCount = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / featureBatchListPageSize),
  );

  return {
    items,
    page: params.page,
    pageSize: featureBatchListPageSize,
    totalCount,
    totalPages,
  };
}

export async function getFeatureGenerationBatchDetail(batchId: string) {
  const db = getDb();

  const [batch] = await db
    .select()
    .from(featureGenerationBatches)
    .where(eq(featureGenerationBatches.id, batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  const [snapshotCount, raceCount, entryCount, featureKeyCounts] =
    await Promise.all([
    db
      .select({ value: count() })
      .from(featureSnapshots)
      .where(eq(featureSnapshots.generationBatchId, batchId)),
    db
      .selectDistinct({ raceId: featureSnapshots.raceId })
      .from(featureSnapshots)
      .where(eq(featureSnapshots.generationBatchId, batchId)),
    db
      .selectDistinct({ raceEntryId: featureSnapshots.raceEntryId })
      .from(featureSnapshots)
      .where(eq(featureSnapshots.generationBatchId, batchId)),
    db
      .select({
        featureKey: featureSnapshots.featureKey,
        count: count(),
      })
      .from(featureSnapshots)
      .where(eq(featureSnapshots.generationBatchId, batchId))
      .groupBy(featureSnapshots.featureKey)
      .orderBy(asc(featureSnapshots.featureKey)),
  ]);

  return {
    batch,
    generatedFeatureCount: snapshotCount[0]?.value ?? 0,
    targetRaceCount: raceCount.length,
    targetRaceEntryCount: entryCount.length,
    featureKeyCounts,
  };
}
