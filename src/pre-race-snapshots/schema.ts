import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, "Expected a valid calendar date");

const dateTimeSchema = z.string().refine(
  (value) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value)),
  "Expected ISO 8601 datetime with timezone",
);

export const observationSchema = z.discriminatedUnion("timeStatus", [
  z.object({
    observedAt: dateTimeSchema,
    timeStatus: z.literal("known"),
  }).strict(),
  z.object({
    observedAt: z.null(),
    timeStatus: z.literal("unknown"),
  }).strict(),
]);

export const entityReferenceSchema = z.object({
  internalId: z.string().min(1).nullable(),
  providerEntityId: z.string().min(1).nullable(),
  displayName: z.string().trim().min(1),
}).strict();

export const rawOddsAuditSchema = z.object({
  value: z.number().nullable(),
  observedAt: z.null(),
  featureEligible: z.literal(false),
  reason: z.literal("observation_time_unknown"),
}).strict();

const nullableRawString = z.string().nullable();

export const preRaceEntrySchema = z.object({
  frameNumber: z.number().int().positive(),
  horseNumber: z.number().int().positive(),
  horse: entityReferenceSchema,
  jockey: entityReferenceSchema,
  trainer: entityReferenceSchema.nullable(),
  sex: z.enum(["male", "female", "gelding"]),
  age: z.number().int().positive(),
  assignedWeight: z.number().positive(),
  interval: z.number().int().nonnegative().nullable(),
  zi: z.number().nullable(),
  raw: z.object({
    horseNumberMarker: nullableRawString,
    sexAgeMarker: nullableRawString,
    weightAllowanceMarker: nullableRawString,
    intervalMarker: nullableRawString,
    ziMarker: nullableRawString,
    targetFields: z.object({
      B: nullableRawString,
      直前: nullableRawString,
      芝短: nullableRawString,
      芝中: nullableRawString,
      ダ短: nullableRawString,
      ダ中: nullableRawString,
      脚: nullableRawString,
    }).strict(),
    odds: rawOddsAuditSchema,
  }).strict(),
}).strict();

export const preRaceSnapshotSchema = z.object({
  schemaVersion: z.literal("pre-race-snapshot-v1"),
  providerCode: z.literal("jra_van"),
  observation: observationSchema,
  source: z.object({
    fileName: z.string().min(1).nullable(),
    checksum: z.string().min(1).nullable(),
  }).strict(),
  race: z.object({
    raceDate: dateSchema,
    venue: z.string().trim().min(1),
    raceNumber: z.number().int().min(1),
    scheduledStartAt: dateTimeSchema,
    surface: z.enum(["turf", "dirt"]),
    distanceMeters: z.number().int().positive(),
    declaredEntries: z.number().int().positive(),
  }).strict(),
  entries: z.array(preRaceEntrySchema),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.entries.length > snapshot.race.declaredEntries) {
    context.addIssue({
      code: "custom",
      path: ["entries"],
      message: "entries.length must not exceed declaredEntries",
    });
  }

  if (
    snapshot.observation.timeStatus === "known"
    && Date.parse(snapshot.observation.observedAt) >= Date.parse(snapshot.race.scheduledStartAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["observation", "observedAt"],
      message: "known observedAt must be earlier than scheduledStartAt",
    });
  }
});
