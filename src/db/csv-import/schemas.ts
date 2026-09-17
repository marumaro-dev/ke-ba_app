import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(z.string().uuid().optional());

const requiredString = z.string().trim().min(1);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTimeString = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && !Number.isNaN(Date.parse(value)), {
    message: "Expected ISO 8601 datetime with timezone",
  })
  .transform((value) => new Date(value));

const optionalDateTimeString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(dateTimeString.nullable());

const positiveInteger = z.coerce.number().int().positive();
const optionalPositiveInteger = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().int().positive().nullable());
const optionalInteger = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().int().nullable());
const positiveDecimalString = z
  .string()
  .trim()
  .refine((value) => Number(value) > 0, {
    message: "Expected a positive decimal number",
  });
const optionalPositiveDecimalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .refine((value) => Number(value) > 0, {
        message: "Expected a positive decimal number",
      })
      .nullable(),
  );

const commonColumns = {
  id: optionalUuid,
  provider_code: requiredString,
  available_at: optionalDateTimeString,
  available_at_status: z.enum(["known", "unknown"]),
  observed_at: optionalDateTimeString,
  observed_at_status: z.enum(["known", "unknown"]),
  imported_at: optionalDateTimeString,
};

function validateTimeStatus(value: {
  available_at: Date | null;
  available_at_status: "known" | "unknown";
  observed_at: Date | null;
  observed_at_status: "known" | "unknown";
}, context: z.RefinementCtx) {
  for (const prefix of ["available", "observed"] as const) {
    const time = value[`${prefix}_at`];
    const status = value[`${prefix}_at_status`];
    if ((status === "known") !== (time !== null)) {
      context.addIssue({ code: "custom", path: [`${prefix}_at`],
        message: `${prefix}_at and ${prefix}_at_status disagree` });
    }
  }
}

export const raceCsvSchema = z.object({
  ...commonColumns,
  source_race_id: requiredString,
  race_date: dateString,
  venue: requiredString,
  race_number: z.coerce.number().int().min(1).max(99),
  name: requiredString,
  scheduled_start_at: dateTimeString,
  surface: requiredString,
  distance_meters: positiveInteger,
  weather: optionalString,
  track_condition: optionalString,
  status: z.enum(["scheduled", "confirmed", "cancelled"]),
}).superRefine(validateTimeStatus);

export const horseCsvSchema = z.object({
  ...commonColumns,
  source_horse_id: requiredString,
  name: requiredString,
  birth_date: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(dateString.nullable()),
  sex: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(z.enum(["male", "female", "gelding"]).nullable()),
  color: optionalString,
}).superRefine(validateTimeStatus);

export const jockeyCsvSchema = z.object({
  ...commonColumns,
  source_jockey_id: requiredString,
  name: requiredString,
}).superRefine(validateTimeStatus);

export const trainerCsvSchema = z.object({
  ...commonColumns,
  source_trainer_id: requiredString,
  name: requiredString,
  affiliation: optionalString,
}).superRefine(validateTimeStatus);

export const raceEntryCsvSchema = z.object({
  ...commonColumns,
  source_entry_id: requiredString,
  source_race_id: requiredString,
  source_horse_id: requiredString,
  source_jockey_id: requiredString,
  source_trainer_id: requiredString,
  frame_number: z.coerce.number().int().min(1).max(8),
  horse_number: z.coerce.number().int().min(1).max(99),
  assigned_weight: positiveDecimalString,
  body_weight: optionalPositiveInteger,
  body_weight_diff: optionalInteger,
  status: z.enum(["entered", "running", "scratched", "excluded"]),
}).superRefine(validateTimeStatus);

export const raceResultCsvSchema = z.object({
  ...commonColumns,
  source_result_id: requiredString,
  source_entry_id: requiredString,
  finish_position: optionalPositiveInteger,
  finish_status: z.enum([
    "finished",
    "did_not_finish",
    "disqualified",
    "scratched",
  ]),
  finish_time_milliseconds: optionalPositiveInteger,
  margin: optionalString,
  final_odds: optionalPositiveDecimalString,
  popularity: optionalPositiveInteger,
  status: z.enum(["preliminary", "confirmed", "corrected"]),
}).superRefine(validateTimeStatus);

export type RaceCsvRecord = z.infer<typeof raceCsvSchema>;
export type HorseCsvRecord = z.infer<typeof horseCsvSchema>;
export type JockeyCsvRecord = z.infer<typeof jockeyCsvSchema>;
export type TrainerCsvRecord = z.infer<typeof trainerCsvSchema>;
export type RaceEntryCsvRecord = z.infer<typeof raceEntryCsvSchema>;
export type RaceResultCsvRecord = z.infer<typeof raceResultCsvSchema>;
