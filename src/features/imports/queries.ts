import { and, count, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { importBatches, importErrors } from "@/db/schema";
import {
  importListPageSize,
  type ImportListSearchParams,
} from "./schemas";

export async function listImportBatches(params: ImportListSearchParams) {
  const db = getDb();
  const conditions = buildImportConditions(params);
  const offset = (params.page - 1) * importListPageSize;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(importBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(importBatches.startedAt))
      .limit(importListPageSize)
      .offset(offset),
    db
      .select({ value: count() })
      .from(importBatches)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const totalCount = totalRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / importListPageSize));

  return {
    items,
    page: params.page,
    pageSize: importListPageSize,
    totalCount,
    totalPages,
  };
}

export async function getImportBatchDetail(batchId: string) {
  const db = getDb();

  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) {
    return null;
  }

  const errors = await db
    .select()
    .from(importErrors)
    .where(eq(importErrors.importBatchId, batchId))
    .orderBy(desc(importErrors.createdAt));

  return {
    batch,
    errors,
  };
}

function buildImportConditions(params: ImportListSearchParams) {
  const conditions = [];

  if (params.mode !== "all") {
    conditions.push(eq(importBatches.mode, params.mode));
  }

  if (params.status !== "all") {
    conditions.push(eq(importBatches.status, params.status));
  }

  return conditions;
}
