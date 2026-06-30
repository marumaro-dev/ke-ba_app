import {
  check,
  date,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  index,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestampColumns = {
  availableAt: timestamp("available_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  observedAt: timestamp("observed_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  importedAt: timestamp("imported_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
};

export const raceStatusEnum = pgEnum("race_status", [
  "scheduled",
  "confirmed",
  "cancelled",
]);

export const entryStatusEnum = pgEnum("entry_status", [
  "entered",
  "running",
  "scratched",
  "excluded",
]);

export const resultStatusEnum = pgEnum("result_status", [
  "preliminary",
  "confirmed",
  "corrected",
]);

export const finishStatusEnum = pgEnum("finish_status", [
  "finished",
  "did_not_finish",
  "disqualified",
  "scratched",
]);

export const horseSexEnum = pgEnum("horse_sex", [
  "male",
  "female",
  "gelding",
]);

export const importModeEnum = pgEnum("import_mode", ["dry_run", "import"]);

export const importBatchStatusEnum = pgEnum("import_batch_status", [
  "running",
  "succeeded",
  "failed",
]);

export const featureValueTypeEnum = pgEnum("feature_value_type", [
  "number",
  "boolean",
  "string",
  "json",
]);

export const featureGenerationStatusEnum = pgEnum("feature_generation_status", [
  "running",
  "succeeded",
  "failed",
]);

export const predictionRunStatusEnum = pgEnum("prediction_run_status", [
  "running",
  "succeeded",
  "failed",
]);

export const predictionTypeEnum = pgEnum("prediction_type", ["rule_based"]);

export const races = pgTable(
  "races",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raceDate: date("race_date", { mode: "string" }).notNull(),
    venue: text("venue").notNull(),
    raceNumber: smallint("race_number").notNull(),
    name: text("name").notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    surface: text("surface").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    weather: text("weather"),
    trackCondition: text("track_condition"),
    status: raceStatusEnum("status").notNull().default("scheduled"),
    ...timestampColumns,
  },
  (table) => [
    index("races_scheduled_start_at_idx").on(table.scheduledStartAt),
    unique("races_date_venue_number_unique").on(
      table.raceDate,
      table.venue,
      table.raceNumber,
    ),
    check(
      "races_race_number_check",
      sql`${table.raceNumber} between 1 and 99`,
    ),
    check(
      "races_distance_meters_check",
      sql`${table.distanceMeters} > 0`,
    ),
  ],
);

export const horses = pgTable("horses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  birthDate: date("birth_date", { mode: "string" }),
  sex: horseSexEnum("sex"),
  color: text("color"),
  ...timestampColumns,
});

export const jockeys = pgTable("jockeys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ...timestampColumns,
});

export const trainers = pgTable("trainers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  affiliation: text("affiliation"),
  ...timestampColumns,
});

export const raceEntries = pgTable(
  "race_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "restrict" }),
    jockeyId: uuid("jockey_id")
      .notNull()
      .references(() => jockeys.id, { onDelete: "restrict" }),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => trainers.id, { onDelete: "restrict" }),
    frameNumber: smallint("frame_number").notNull(),
    horseNumber: smallint("horse_number").notNull(),
    assignedWeight: numeric("assigned_weight", {
      precision: 4,
      scale: 1,
    }).notNull(),
    bodyWeight: integer("body_weight"),
    bodyWeightDiff: integer("body_weight_diff"),
    status: entryStatusEnum("status").notNull().default("entered"),
    ...timestampColumns,
  },
  (table) => [
    index("race_entries_horse_id_idx").on(table.horseId),
    unique("race_entries_race_horse_unique").on(
      table.raceId,
      table.horseId,
    ),
    unique("race_entries_race_horse_number_unique").on(
      table.raceId,
      table.horseNumber,
    ),
    check(
      "race_entries_frame_number_check",
      sql`${table.frameNumber} between 1 and 8`,
    ),
    check(
      "race_entries_horse_number_check",
      sql`${table.horseNumber} between 1 and 99`,
    ),
    check(
      "race_entries_assigned_weight_check",
      sql`${table.assignedWeight} > 0`,
    ),
    check(
      "race_entries_body_weight_check",
      sql`${table.bodyWeight} is null or ${table.bodyWeight} > 0`,
    ),
  ],
);

export const raceResults = pgTable(
  "race_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    raceEntryId: uuid("race_entry_id")
      .notNull()
      .references(() => raceEntries.id, { onDelete: "cascade" }),
    finishPosition: smallint("finish_position"),
    finishStatus: finishStatusEnum("finish_status")
      .notNull()
      .default("finished"),
    finishTimeMilliseconds: integer("finish_time_milliseconds"),
    margin: text("margin"),
    finalOdds: numeric("final_odds", { precision: 8, scale: 1 }),
    popularity: smallint("popularity"),
    status: resultStatusEnum("status").notNull().default("preliminary"),
    ...timestampColumns,
  },
  (table) => [
    unique("race_results_race_entry_unique").on(table.raceEntryId),
    check(
      "race_results_finish_position_check",
      sql`${table.finishPosition} is null or ${table.finishPosition} > 0`,
    ),
    check(
      "race_results_finish_time_check",
      sql`${table.finishTimeMilliseconds} is null or ${table.finishTimeMilliseconds} > 0`,
    ),
    check(
      "race_results_final_odds_check",
      sql`${table.finalOdds} is null or ${table.finalOdds} > 0`,
    ),
    check(
      "race_results_popularity_check",
      sql`${table.popularity} is null or ${table.popularity} > 0`,
    ),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerCode: text("provider_code").notNull(),
    importType: text("import_type").notNull(),
    mode: importModeEnum("mode").notNull(),
    status: importBatchStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    totalRows: integer("total_rows").notNull().default(0),
    insertedRows: integer("inserted_rows").notNull().default(0),
    updatedRows: integer("updated_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    sourceDir: text("source_dir").notNull(),
    summaryJson: jsonb("summary_json").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_batches_started_at_idx").on(table.startedAt),
    index("import_batches_status_idx").on(table.status),
  ],
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    rowNumber: integer("row_number"),
    entityType: text("entity_type"),
    sourceId: text("source_id"),
    errorCode: text("error_code").notNull(),
    errorMessage: text("error_message").notNull(),
    rawRowJson: jsonb("raw_row_json"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_errors_batch_id_idx").on(table.importBatchId),
    index("import_errors_file_row_idx").on(table.fileName, table.rowNumber),
  ],
);

export const featureDefinitions = pgTable(
  "feature_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureKey: text("feature_key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    entityType: text("entity_type").notNull(),
    valueType: featureValueTypeEnum("value_type").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    calculationLogic: text("calculation_logic").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("feature_definitions_key_version_unique").on(
      table.featureKey,
      table.version,
    ),
  ],
);

export const featureGenerationBatches = pgTable(
  "feature_generation_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: featureGenerationStatusEnum("status").notNull().default("running"),
    mode: importModeEnum("mode").notNull(),
    asOfAt: timestamp("as_of_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    featureVersion: integer("feature_version").notNull().default(1),
    totalCount: integer("total_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    summaryJson: jsonb("summary_json").notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("feature_generation_batches_started_at_idx").on(table.startedAt),
    index("feature_generation_batches_status_idx").on(table.status),
  ],
);

export const featureSnapshots = pgTable(
  "feature_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureDefinitionId: uuid("feature_definition_id")
      .notNull()
      .references(() => featureDefinitions.id, { onDelete: "restrict" }),
    generationBatchId: uuid("generation_batch_id").references(
      () => featureGenerationBatches.id,
      { onDelete: "set null" },
    ),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    raceEntryId: uuid("race_entry_id")
      .notNull()
      .references(() => raceEntries.id, { onDelete: "cascade" }),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    jockeyId: uuid("jockey_id").references(() => jockeys.id, {
      onDelete: "set null",
    }),
    featureKey: text("feature_key").notNull(),
    featureVersion: integer("feature_version").notNull().default(1),
    asOfAt: timestamp("as_of_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    featureValueNumber: numeric("feature_value_number", {
      precision: 18,
      scale: 6,
    }),
    featureValueText: text("feature_value_text"),
    featureValueBoolean: boolean("feature_value_boolean"),
    featureValueJson: jsonb("feature_value_json"),
    sourceAvailableUntil: timestamp("source_available_until", {
      withTimezone: true,
      mode: "date",
    }),
    sourceObservedUntil: timestamp("source_observed_until", {
      withTimezone: true,
      mode: "date",
    }),
    generatedAt: timestamp("generated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("feature_snapshots_key_entry_asof_unique").on(
      table.featureKey,
      table.featureVersion,
      table.raceEntryId,
      table.asOfAt,
    ),
    index("feature_snapshots_race_entry_idx").on(table.raceEntryId),
    index("feature_snapshots_as_of_at_idx").on(table.asOfAt),
  ],
);

export const predictionRuns = pgTable(
  "prediction_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predictionType: predictionTypeEnum("prediction_type")
      .notNull()
      .default("rule_based"),
    modelVersion: text("model_version").notNull().default("rule-v1"),
    status: predictionRunStatusEnum("status").notNull().default("running"),
    mode: importModeEnum("mode").notNull(),
    asOfAt: timestamp("as_of_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    targetRaceId: uuid("target_race_id").references(() => races.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    totalCount: integer("total_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    summaryJson: jsonb("summary_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("prediction_runs_started_at_idx").on(table.startedAt),
    index("prediction_runs_status_idx").on(table.status),
    index("prediction_runs_as_of_at_idx").on(table.asOfAt),
  ],
);

export const racePredictions = pgTable(
  "race_predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predictionRunId: uuid("prediction_run_id")
      .notNull()
      .references(() => predictionRuns.id, { onDelete: "cascade" }),
    predictionType: predictionTypeEnum("prediction_type")
      .notNull()
      .default("rule_based"),
    modelVersion: text("model_version").notNull().default("rule-v1"),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    raceEntryId: uuid("race_entry_id")
      .notNull()
      .references(() => raceEntries.id, { onDelete: "cascade" }),
    horseId: uuid("horse_id")
      .notNull()
      .references(() => horses.id, { onDelete: "cascade" }),
    jockeyId: uuid("jockey_id").references(() => jockeys.id, {
      onDelete: "set null",
    }),
    asOfAt: timestamp("as_of_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    predictionScore: numeric("prediction_score", {
      precision: 6,
      scale: 3,
    }).notNull(),
    rankInRace: integer("rank_in_race"),
    scoreComponentsJson: jsonb("score_components_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    featureSnapshotKeysJson: jsonb("feature_snapshot_keys_json")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("race_predictions_run_idx").on(table.predictionRunId),
    index("race_predictions_race_idx").on(table.raceId),
    unique("race_predictions_type_version_entry_asof_unique").on(
      table.predictionType,
      table.modelVersion,
      table.raceEntryId,
      table.asOfAt,
    ),
  ],
);

export const predictionEvaluations = pgTable(
  "prediction_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predictionRunId: uuid("prediction_run_id")
      .notNull()
      .references(() => predictionRuns.id, { onDelete: "cascade" }),
    racePredictionId: uuid("race_prediction_id")
      .notNull()
      .references(() => racePredictions.id, { onDelete: "cascade" }),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    raceEntryId: uuid("race_entry_id")
      .notNull()
      .references(() => raceEntries.id, { onDelete: "cascade" }),
    predictedRank: integer("predicted_rank"),
    predictionScore: numeric("prediction_score", {
      precision: 6,
      scale: 3,
    }).notNull(),
    finishPosition: integer("finish_position"),
    finishStatus: finishStatusEnum("finish_status"),
    isPredictedTop1: boolean("is_predicted_top1").notNull().default(false),
    topPredictionFinishPosition: integer("top_prediction_finish_position"),
    topPredictionIsTop3: boolean("top_prediction_is_top3"),
    isActualWinner: boolean("is_actual_winner").notNull().default(false),
    actualWinnerInPredictedTop3: boolean(
      "actual_winner_in_predicted_top3",
    ).notNull(),
    rankDiff: integer("rank_diff"),
    resultAvailableAt: timestamp("result_available_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    evaluatedAt: timestamp("evaluated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    summaryJson: jsonb("summary_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("prediction_evaluations_prediction_unique").on(
      table.racePredictionId,
    ),
    index("prediction_evaluations_run_idx").on(table.predictionRunId),
    index("prediction_evaluations_race_idx").on(table.raceId),
  ],
);

export type Race = typeof races.$inferSelect;
export type Horse = typeof horses.$inferSelect;
export type Jockey = typeof jockeys.$inferSelect;
export type Trainer = typeof trainers.$inferSelect;
export type RaceEntry = typeof raceEntries.$inferSelect;
export type RaceResult = typeof raceResults.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportError = typeof importErrors.$inferSelect;
export type FeatureDefinition = typeof featureDefinitions.$inferSelect;
export type FeatureSnapshot = typeof featureSnapshots.$inferSelect;
export type FeatureGenerationBatch =
  typeof featureGenerationBatches.$inferSelect;
export type PredictionRun = typeof predictionRuns.$inferSelect;
export type RacePrediction = typeof racePredictions.$inferSelect;
export type PredictionEvaluation =
  typeof predictionEvaluations.$inferSelect;
