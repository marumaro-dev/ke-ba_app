import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { z } from "zod";

import { loadLocalEnv } from "../../lib/load-env";
import {
  horses,
  importBatches,
  importErrors,
  jockeys,
  raceEntries,
  raceResults,
  races,
  trainers,
} from "../schema";
import { readCsvFile } from "./csv-parser";
import {
  CsvImportError,
  type CsvImportErrorDetail,
  zodIssuesToDetails,
} from "./errors";
import { resolveInternalId, toExternalKey } from "./ids";
import {
  horseCsvSchema,
  jockeyCsvSchema,
  raceCsvSchema,
  raceEntryCsvSchema,
  raceResultCsvSchema,
  trainerCsvSchema,
  type HorseCsvRecord,
  type JockeyCsvRecord,
  type RaceCsvRecord,
  type RaceEntryCsvRecord,
  type RaceResultCsvRecord,
  type TrainerCsvRecord,
} from "./schemas";

type ImportOptions = {
  csvDir: string;
  dryRun: boolean;
};

type ImportSummaryItem = {
  file: string;
  entityType: string;
  read: number;
  valid: number;
  upserted: number;
};

type ImportCounters = {
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
};

type LoadedFile<T> = {
  read: number;
  records: Array<T & { rowNumber: number; rawRow: Record<string, string> }>;
};

type LoadedCsv = {
  races: LoadedFile<RaceCsvRecord>;
  horses: LoadedFile<HorseCsvRecord>;
  jockeys: LoadedFile<JockeyCsvRecord>;
  trainers: LoadedFile<TrainerCsvRecord>;
  raceEntries: LoadedFile<RaceEntryCsvRecord>;
  raceResults: LoadedFile<RaceResultCsvRecord>;
};

type ResolvedRecords = {
  races: Array<
    RaceCsvRecord & {
      internalId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
  horses: Array<
    HorseCsvRecord & {
      internalId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
  jockeys: Array<
    JockeyCsvRecord & {
      internalId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
  trainers: Array<
    TrainerCsvRecord & {
      internalId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
  raceEntries: Array<
    RaceEntryCsvRecord & {
      internalId: string;
      raceId: string;
      horseId: string;
      jockeyId: string;
      trainerId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
  raceResults: Array<
    RaceResultCsvRecord & {
      internalId: string;
      raceEntryId: string;
      rowNumber: number;
      rawRow: Record<string, string>;
    }
  >;
};

const files = {
  races: "races.sample.csv",
  horses: "horses.sample.csv",
  jockeys: "jockeys.sample.csv",
  trainers: "trainers.sample.csv",
  raceEntries: "race_entries.sample.csv",
  raceResults: "race_results.sample.csv",
} as const;

export async function importCsv(options: ImportOptions) {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new CsvImportError("DATABASE_URL is required for CSV import.");
  }

  const startedAt = new Date();
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client);
  const mode = options.dryRun ? "dry_run" : "import";

  const batch = await createImportBatch(db, {
    mode,
    startedAt,
    sourceDir: options.csvDir,
  });

  try {
    const loaded = await loadAndValidateCsv(options.csvDir);
    const resolved = resolveReferences(loaded);
    const summary = createSummary(loaded, resolved);
    const providerCode = inferProviderCode(loaded) ?? "csv";
    const counters: ImportCounters = {
      insertedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
    };

    if (!options.dryRun) {
      await db.transaction(async (tx) => {
        const raceIdMap = new Map<string, string>();
        const entryIdMap = new Map<string, string>();

        for (const race of resolved.races) {
          const exists = await tx
            .select({ id: races.id })
            .from(races)
            .where(
              and(
                eq(races.raceDate, race.race_date),
                eq(races.venue, race.venue),
                eq(races.raceNumber, race.race_number),
              ),
            )
            .limit(1);

          const [row] = await tx
            .insert(races)
            .values({
              id: race.internalId,
              raceDate: race.race_date,
              venue: race.venue,
              raceNumber: race.race_number,
              name: race.name,
              scheduledStartAt: race.scheduled_start_at,
              surface: race.surface,
              distanceMeters: race.distance_meters,
              weather: race.weather,
              trackCondition: race.track_condition,
              status: race.status,
              availableAt: race.available_at,
              observedAt: race.observed_at,
              importedAt: race.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [races.raceDate, races.venue, races.raceNumber],
              set: {
                name: race.name,
                scheduledStartAt: race.scheduled_start_at,
                surface: race.surface,
                distanceMeters: race.distance_meters,
                weather: race.weather,
                trackCondition: race.track_condition,
                status: race.status,
                availableAt: race.available_at,
                observedAt: race.observed_at,
                importedAt: race.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            })
            .returning({ id: races.id });

          incrementCounters(counters, exists.length > 0);
          raceIdMap.set(
            toExternalKey(race.provider_code, race.source_race_id),
            row.id,
          );
        }
        summary[0].upserted = resolved.races.length;

        for (const horse of resolved.horses) {
          const exists = await tx
            .select({ id: horses.id })
            .from(horses)
            .where(eq(horses.id, horse.internalId))
            .limit(1);

          await tx
            .insert(horses)
            .values({
              id: horse.internalId,
              name: horse.name,
              birthDate: horse.birth_date,
              sex: horse.sex,
              color: horse.color,
              availableAt: horse.available_at,
              observedAt: horse.observed_at,
              importedAt: horse.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: horses.id,
              set: {
                name: horse.name,
                birthDate: horse.birth_date,
                sex: horse.sex,
                color: horse.color,
                availableAt: horse.available_at,
                observedAt: horse.observed_at,
                importedAt: horse.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            });
          incrementCounters(counters, exists.length > 0);
        }
        summary[1].upserted = resolved.horses.length;

        for (const jockey of resolved.jockeys) {
          const exists = await tx
            .select({ id: jockeys.id })
            .from(jockeys)
            .where(eq(jockeys.id, jockey.internalId))
            .limit(1);

          await tx
            .insert(jockeys)
            .values({
              id: jockey.internalId,
              name: jockey.name,
              availableAt: jockey.available_at,
              observedAt: jockey.observed_at,
              importedAt: jockey.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: jockeys.id,
              set: {
                name: jockey.name,
                availableAt: jockey.available_at,
                observedAt: jockey.observed_at,
                importedAt: jockey.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            });
          incrementCounters(counters, exists.length > 0);
        }
        summary[2].upserted = resolved.jockeys.length;

        for (const trainer of resolved.trainers) {
          const exists = await tx
            .select({ id: trainers.id })
            .from(trainers)
            .where(eq(trainers.id, trainer.internalId))
            .limit(1);

          await tx
            .insert(trainers)
            .values({
              id: trainer.internalId,
              name: trainer.name,
              affiliation: trainer.affiliation,
              availableAt: trainer.available_at,
              observedAt: trainer.observed_at,
              importedAt: trainer.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: trainers.id,
              set: {
                name: trainer.name,
                affiliation: trainer.affiliation,
                availableAt: trainer.available_at,
                observedAt: trainer.observed_at,
                importedAt: trainer.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            });
          incrementCounters(counters, exists.length > 0);
        }
        summary[3].upserted = resolved.trainers.length;

        for (const entry of resolved.raceEntries) {
          const raceId =
            raceIdMap.get(
              toExternalKey(entry.provider_code, entry.source_race_id),
            ) ?? entry.raceId;
          const exists = await tx
            .select({ id: raceEntries.id })
            .from(raceEntries)
            .where(
              and(
                eq(raceEntries.raceId, raceId),
                eq(raceEntries.horseId, entry.horseId),
              ),
            )
            .limit(1);

          const [row] = await tx
            .insert(raceEntries)
            .values({
              id: entry.internalId,
              raceId,
              horseId: entry.horseId,
              jockeyId: entry.jockeyId,
              trainerId: entry.trainerId,
              frameNumber: entry.frame_number,
              horseNumber: entry.horse_number,
              assignedWeight: entry.assigned_weight,
              bodyWeight: entry.body_weight,
              bodyWeightDiff: entry.body_weight_diff,
              status: entry.status,
              availableAt: entry.available_at,
              observedAt: entry.observed_at,
              importedAt: entry.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [raceEntries.raceId, raceEntries.horseId],
              set: {
                jockeyId: entry.jockeyId,
                trainerId: entry.trainerId,
                frameNumber: entry.frame_number,
                horseNumber: entry.horse_number,
                assignedWeight: entry.assigned_weight,
                bodyWeight: entry.body_weight,
                bodyWeightDiff: entry.body_weight_diff,
                status: entry.status,
                availableAt: entry.available_at,
                observedAt: entry.observed_at,
                importedAt: entry.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            })
            .returning({ id: raceEntries.id });

          incrementCounters(counters, exists.length > 0);
          entryIdMap.set(
            toExternalKey(entry.provider_code, entry.source_entry_id),
            row.id,
          );
        }
        summary[4].upserted = resolved.raceEntries.length;

        for (const result of resolved.raceResults) {
          const raceEntryId =
            entryIdMap.get(
              toExternalKey(result.provider_code, result.source_entry_id),
            ) ?? result.raceEntryId;
          const exists = await tx
            .select({ id: raceResults.id })
            .from(raceResults)
            .where(eq(raceResults.raceEntryId, raceEntryId))
            .limit(1);

          await tx
            .insert(raceResults)
            .values({
              id: result.internalId,
              raceEntryId,
              finishPosition: result.finish_position,
              finishStatus: result.finish_status,
              finishTimeMilliseconds: result.finish_time_milliseconds,
              margin: result.margin,
              finalOdds: result.final_odds,
              popularity: result.popularity,
              status: result.status,
              availableAt: result.available_at,
              observedAt: result.observed_at,
              importedAt: result.imported_at ?? new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: raceResults.raceEntryId,
              set: {
                finishPosition: result.finish_position,
                finishStatus: result.finish_status,
                finishTimeMilliseconds: result.finish_time_milliseconds,
                margin: result.margin,
                finalOdds: result.final_odds,
                popularity: result.popularity,
                status: result.status,
                availableAt: result.available_at,
                observedAt: result.observed_at,
                importedAt: result.imported_at ?? new Date(),
                updatedAt: new Date(),
              },
            });
          incrementCounters(counters, exists.length > 0);
        }
        summary[5].upserted = resolved.raceResults.length;

        await tx.execute(sql`select 1`);
      });
    }

    await db
      .update(importBatches)
      .set({
        providerCode,
        status: "succeeded",
        finishedAt: new Date(),
        totalRows: sumSummary(summary, "read"),
        insertedRows: counters.insertedRows,
        updatedRows: counters.updatedRows,
        skippedRows: counters.skippedRows,
        failedRows: 0,
        summaryJson: summary,
      })
      .where(eq(importBatches.id, batch.id));

    return {
      batchId: batch.id,
      mode,
      summary,
      counters,
    };
  } catch (error) {
    const details = toImportErrorDetails(error);

    if (details.length > 0) {
      await db.insert(importErrors).values(
        details.map((detail) => ({
          importBatchId: batch.id,
          fileName: detail.file,
          rowNumber: detail.rowNumber,
          entityType: detail.entityType,
          sourceId: detail.sourceId,
          errorCode: detail.code,
          errorMessage: detail.message,
          rawRowJson: detail.rawRow,
        })),
      );
    }

    await db
      .update(importBatches)
      .set({
        status: "failed",
        finishedAt: new Date(),
        failedRows: Math.max(details.length, 1),
        summaryJson: {
          error: error instanceof Error ? error.message : String(error),
          details,
        },
      })
      .where(eq(importBatches.id, batch.id));

    if (error instanceof CsvImportError) {
      throw error;
    }

    throw new CsvImportError("CSV import failed while writing to database.", [
      {
        file: "(database)",
        code: "DB_ERROR",
        message: sanitizeDatabaseError(error),
      },
    ]);
  } finally {
    await client.end();
  }
}

async function createImportBatch(
  db: ReturnType<typeof drizzle>,
  values: {
    mode: "dry_run" | "import";
    startedAt: Date;
    sourceDir: string;
  },
) {
  try {
    const [batch] = await db
      .insert(importBatches)
      .values({
        providerCode: "csv",
        importType: "csv",
        mode: values.mode,
        status: "running",
        startedAt: values.startedAt,
        sourceDir: values.sourceDir,
        summaryJson: [],
      })
      .returning({ id: importBatches.id });

    return batch;
  } catch (error) {
    throw new CsvImportError("CSV import failed while creating history batch.", [
      {
        file: "(database)",
        code: "DB_ERROR",
        message: sanitizeDatabaseError(error),
      },
    ]);
  }
}

function createSummary(loaded: LoadedCsv, resolved: ResolvedRecords) {
  return [
    createSummaryItem(files.races, "race", loaded.races.read, resolved.races.length),
    createSummaryItem(files.horses, "horse", loaded.horses.read, resolved.horses.length),
    createSummaryItem(
      files.jockeys,
      "jockey",
      loaded.jockeys.read,
      resolved.jockeys.length,
    ),
    createSummaryItem(
      files.trainers,
      "trainer",
      loaded.trainers.read,
      resolved.trainers.length,
    ),
    createSummaryItem(
      files.raceEntries,
      "race_entry",
      loaded.raceEntries.read,
      resolved.raceEntries.length,
    ),
    createSummaryItem(
      files.raceResults,
      "race_result",
      loaded.raceResults.read,
      resolved.raceResults.length,
    ),
  ];
}

function createSummaryItem(
  file: string,
  entityType: string,
  read: number,
  valid: number,
): ImportSummaryItem {
  return {
    file,
    entityType,
    read,
    valid,
    upserted: 0,
  };
}

function incrementCounters(counters: ImportCounters, existed: boolean) {
  if (existed) {
    counters.updatedRows += 1;
  } else {
    counters.insertedRows += 1;
  }
}

function sumSummary(summary: ImportSummaryItem[], key: "read" | "valid" | "upserted") {
  return summary.reduce((total, item) => total + item[key], 0);
}

function inferProviderCode(loaded: LoadedCsv) {
  return (
    loaded.races.records[0]?.provider_code ??
    loaded.horses.records[0]?.provider_code ??
    loaded.jockeys.records[0]?.provider_code ??
    loaded.trainers.records[0]?.provider_code ??
    loaded.raceEntries.records[0]?.provider_code ??
    loaded.raceResults.records[0]?.provider_code
  );
}

function toImportErrorDetails(error: unknown): CsvImportErrorDetail[] {
  if (error instanceof CsvImportError && error.details.length > 0) {
    return error.details;
  }

  return [
    {
      file: "(database)",
      code: "DB_ERROR",
      message: sanitizeDatabaseError(error),
    },
  ];
}

function sanitizeDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const constraint = getErrorField(error, "constraint");
  const detail = getErrorField(error, "detail");

  return [
    constraint ? `constraint=${constraint}` : undefined,
    detail,
    error.message
      .replace(/\nparams:[\s\S]*/m, "")
      .replace(/Failed query:[\s\S]*/m, "Database query failed."),
  ]
    .filter(Boolean)
    .join(" / ");
}

function getErrorField(error: Error, field: "constraint" | "detail") {
  const value = (error as Error & Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function resolveReferences(loaded: LoadedCsv) {
  const raceIds = new Map<string, string>();
  const horseIds = new Map<string, string>();
  const jockeyIds = new Map<string, string>();
  const trainerIds = new Map<string, string>();
  const entryIds = new Map<string, string>();
  const errors: CsvImportErrorDetail[] = [];

  const resolved: ResolvedRecords = {
    races: loaded.races.records.map((record) => {
      const internalId = resolveInternalId(
        record.id,
        record.provider_code,
        "race",
        record.source_race_id,
      );
      raceIds.set(
        toExternalKey(record.provider_code, record.source_race_id),
        internalId,
      );
      return { ...record, internalId };
    }),
    horses: loaded.horses.records.map((record) => {
      const internalId = resolveInternalId(
        record.id,
        record.provider_code,
        "horse",
        record.source_horse_id,
      );
      horseIds.set(
        toExternalKey(record.provider_code, record.source_horse_id),
        internalId,
      );
      return { ...record, internalId };
    }),
    jockeys: loaded.jockeys.records.map((record) => {
      const internalId = resolveInternalId(
        record.id,
        record.provider_code,
        "jockey",
        record.source_jockey_id,
      );
      jockeyIds.set(
        toExternalKey(record.provider_code, record.source_jockey_id),
        internalId,
      );
      return { ...record, internalId };
    }),
    trainers: loaded.trainers.records.map((record) => {
      const internalId = resolveInternalId(
        record.id,
        record.provider_code,
        "trainer",
        record.source_trainer_id,
      );
      trainerIds.set(
        toExternalKey(record.provider_code, record.source_trainer_id),
        internalId,
      );
      return { ...record, internalId };
    }),
    raceEntries: [],
    raceResults: [],
  };

  for (const record of loaded.raceEntries.records) {
    const raceId = raceIds.get(
      toExternalKey(record.provider_code, record.source_race_id),
    );
    const horseId = horseIds.get(
      toExternalKey(record.provider_code, record.source_horse_id),
    );
    const jockeyId = jockeyIds.get(
      toExternalKey(record.provider_code, record.source_jockey_id),
    );
    const trainerId = trainerIds.get(
      toExternalKey(record.provider_code, record.source_trainer_id),
    );

    if (!raceId || !horseId || !jockeyId || !trainerId) {
      errors.push({
        file: files.raceEntries,
        rowNumber: record.rowNumber,
        entityType: "race_entry",
        sourceId: record.source_entry_id,
        code: "REFERENCE_ERROR",
        message: [
          !raceId ? `source_race_id=${record.source_race_id}` : undefined,
          !horseId ? `source_horse_id=${record.source_horse_id}` : undefined,
          !jockeyId ? `source_jockey_id=${record.source_jockey_id}` : undefined,
          !trainerId
            ? `source_trainer_id=${record.source_trainer_id}`
            : undefined,
        ]
          .filter(Boolean)
          .join(", "),
        rawRow: record.rawRow,
      });
      continue;
    }

    const internalId = resolveInternalId(
      record.id,
      record.provider_code,
      "race_entry",
      record.source_entry_id,
    );
    entryIds.set(
      toExternalKey(record.provider_code, record.source_entry_id),
      internalId,
    );
    resolved.raceEntries.push({
      ...record,
      internalId,
      raceId,
      horseId,
      jockeyId,
      trainerId,
    });
  }

  for (const record of loaded.raceResults.records) {
    const raceEntryId = entryIds.get(
      toExternalKey(record.provider_code, record.source_entry_id),
    );

    if (!raceEntryId) {
      errors.push({
        file: files.raceResults,
        rowNumber: record.rowNumber,
        entityType: "race_result",
        sourceId: record.source_result_id,
        code: "REFERENCE_ERROR",
        message: `source_entry_id=${record.source_entry_id}`,
        rawRow: record.rawRow,
      });
      continue;
    }

    resolved.raceResults.push({
      ...record,
      internalId: resolveInternalId(
        record.id,
        record.provider_code,
        "race_result",
        record.source_result_id,
      ),
      raceEntryId,
    });
  }

  if (errors.length > 0) {
    throw new CsvImportError("CSV reference validation failed.", errors);
  }

  return resolved;
}

async function loadAndValidateCsv(csvDir: string): Promise<LoadedCsv> {
  return {
    races: await loadFile(
      path.join(csvDir, files.races),
      raceCsvSchema,
      "race",
      "source_race_id",
    ),
    horses: await loadFile(
      path.join(csvDir, files.horses),
      horseCsvSchema,
      "horse",
      "source_horse_id",
    ),
    jockeys: await loadFile(
      path.join(csvDir, files.jockeys),
      jockeyCsvSchema,
      "jockey",
      "source_jockey_id",
    ),
    trainers: await loadFile(
      path.join(csvDir, files.trainers),
      trainerCsvSchema,
      "trainer",
      "source_trainer_id",
    ),
    raceEntries: await loadFile(
      path.join(csvDir, files.raceEntries),
      raceEntryCsvSchema,
      "race_entry",
      "source_entry_id",
    ),
    raceResults: await loadFile(
      path.join(csvDir, files.raceResults),
      raceResultCsvSchema,
      "race_result",
      "source_result_id",
    ),
  };
}

async function loadFile<T extends z.ZodType>(
  filePath: string,
  schema: T,
  entityType: string,
  sourceIdColumn: string,
) {
  const rows = await readCsvFile(filePath);
  const details: CsvImportErrorDetail[] = [];
  const records: Array<
    z.infer<T> & { rowNumber: number; rawRow: Record<string, string> }
  > = [];

  for (const row of rows) {
    const parsed = schema.safeParse(row.values);

    if (!parsed.success) {
      details.push(
        ...zodIssuesToDetails(
          path.basename(filePath),
          row.rowNumber,
          entityType,
          row.values[sourceIdColumn],
          row.values,
          parsed.error,
        ),
      );
      continue;
    }

    records.push({
      ...(parsed.data as Record<string, unknown>),
      rowNumber: row.rowNumber,
      rawRow: row.values,
    } as z.infer<T> & { rowNumber: number; rawRow: Record<string, string> });
  }

  if (details.length > 0) {
    throw new CsvImportError("CSV validation failed.", details);
  }

  return {
    read: rows.length,
    records,
  };
}

export function formatImportSummary(result: Awaited<ReturnType<typeof importCsv>>) {
  const lines = [
    `CSV import ${result.mode === "dry_run" ? "dry-run" : "completed"}.`,
    `Batch: ${result.batchId}`,
    "Summary:",
  ];

  for (const item of result.summary) {
    lines.push(
      `- ${item.file}: read=${item.read}, valid=${item.valid}, upserted=${item.upserted}`,
    );
  }

  lines.push(
    `Rows: inserted=${result.counters.insertedRows}, updated=${result.counters.updatedRows}, skipped=${result.counters.skippedRows}`,
  );

  return lines.join("\n");
}
