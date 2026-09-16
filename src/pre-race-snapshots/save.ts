import { createPreRaceSnapshotFingerprint } from "./fingerprint";
import { preRaceSnapshotSchema } from "./schema";
import type { PreRaceEntryDto, PreRaceEntryRaw, PreRaceSnapshotDto } from "./types";

export type KnownSnapshotKey = {
  providerCode: string;
  sourceRaceKey: string;
  observedAt: string;
  schemaVersion: string;
};

export type ExistingSnapshot = {
  id: string;
  fingerprint: string;
};

export type NamedId = { id: string; displayName: string };

export type ResolvedRaceEntry = {
  id: string;
  horse: NamedId | null;
  jockey: NamedId | null;
  trainer: NamedId | null;
};

export type SnapshotInsert = {
  providerCode: string;
  raceId: string | null;
  sourceRaceKey: string;
  raceDate: string;
  venue: string;
  raceNumber: number;
  scheduledStartAt: string;
  surface: "turf" | "dirt";
  distanceMeters: number;
  declaredEntries: number;
  observedAt: string | null;
  observationTimeStatus: "known" | "unknown";
  schemaVersion: string;
  sourceFileName: string | null;
  sourceChecksum: string | null;
  snapshotFingerprint: string;
  isFeatureEligible: boolean;
  eligibilityReason: "observation_time_unknown" | null;
};

export type EntrySnapshotInsert = {
  preRaceSnapshotId: string;
  raceEntryId: string | null;
  horseId: string | null;
  jockeyId: string | null;
  trainerId: string | null;
  sourceEntryKey: string;
  frameNumber: number;
  horseNumber: number;
  horseNameRaw: string;
  jockeyNameRaw: string;
  trainerNameRaw: string | null;
  sex: PreRaceEntryDto["sex"];
  age: number;
  assignedWeight: number;
  interval: number | null;
  zi: number | null;
  rawFieldsJson: PreRaceEntryRaw;
};

export type ResolutionWarningCode =
  | "race_not_resolved"
  | "race_entry_not_resolved"
  | "horse_not_resolved"
  | "jockey_not_resolved"
  | "trainer_not_resolved";

export type ResolutionWarning = {
  code: ResolutionWarningCode;
  horseNumber?: number;
};

export interface SnapshotReader {
  findByFingerprint(fingerprint: string): Promise<ExistingSnapshot | null>;
  findKnownSnapshotByKey(key: KnownSnapshotKey): Promise<ExistingSnapshot | null>;
  resolveRace(key: {
    raceDate: string;
    venue: string;
    raceNumber: number;
  }): Promise<{ id: string } | null>;
  resolveRaceEntry(
    raceId: string,
    horseNumber: number,
  ): Promise<ResolvedRaceEntry | null>;
  countEntrySnapshots(snapshotId: string): Promise<number>;
}

export interface SnapshotTransaction extends SnapshotReader {
  insertSnapshot(row: SnapshotInsert): Promise<string>;
  insertEntrySnapshots(rows: EntrySnapshotInsert[]): Promise<void>;
}

export interface SnapshotRepository extends SnapshotReader {
  /** Rolls back every write if the callback throws. */
  runInTransaction<T>(
    callback: (transaction: SnapshotTransaction) => Promise<T>,
  ): Promise<T>;
}

/** Repository adapters translate database unique violations to this error. */
export class SnapshotUniqueConstraintError extends Error {
  constructor() {
    super("A snapshot unique constraint was violated");
    this.name = "SnapshotUniqueConstraintError";
  }
}

export type SnapshotSaveErrorCode =
  | "validation_error"
  | "unique_conflict"
  | "transaction_error";

export class SnapshotSaveError extends Error {
  constructor(
    public readonly code: SnapshotSaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SnapshotSaveError";
  }
}

export type SaveResult = {
  status: "would_insert" | "inserted" | "duplicate";
  snapshotId: string | null;
  entryCount: number;
  fingerprint: string;
  warnings: ResolutionWarning[];
};

export type SaveInput = {
  dto: PreRaceSnapshotDto;
  sourceRaceKey: string;
  repository: SnapshotRepository;
  mode: "dry_run" | "save";
};

export async function savePreRaceSnapshot(input: SaveInput): Promise<SaveResult> {
  const prepared = prepare(input.dto, input.sourceRaceKey);

  if (input.mode === "dry_run") {
    try {
      const resolution = await resolveIds(input.repository, prepared.dto);
      const existing = await findExisting(input.repository, prepared);
      return existing
        ? duplicateResult(existing.id, prepared, resolution.warnings)
        : {
            status: "would_insert",
            snapshotId: null,
            entryCount: prepared.dto.entries.length,
            fingerprint: prepared.fingerprint,
            warnings: resolution.warnings,
          };
    } catch (error) {
      throw asSaveError(error);
    }
  }

  let warnings: ResolutionWarning[] = [];

  try {
    return await input.repository.runInTransaction(async (transaction) => {
      const resolution = await resolveIds(transaction, prepared.dto);
      warnings = resolution.warnings;
      const existing = await findExisting(transaction, prepared);
      if (existing) {
        return duplicateResult(existing.id, prepared, warnings);
      }

      const snapshotId = await transaction.insertSnapshot(
        makeSnapshotRow(prepared, resolution.raceId),
      );
      await transaction.insertEntrySnapshots(
        makeEntryRows(prepared, snapshotId, resolution.entries),
      );

      const savedCount = await transaction.countEntrySnapshots(snapshotId);
      if (savedCount !== prepared.dto.race.declaredEntries) {
        throw new SnapshotSaveError(
          "transaction_error",
          "Saved entry count does not match declaredEntries",
        );
      }

      return {
        status: "inserted",
        snapshotId,
        entryCount: savedCount,
        fingerprint: prepared.fingerprint,
        warnings,
      };
    });
  } catch (error) {
    if (error instanceof SnapshotUniqueConstraintError) {
      // The transaction has rolled back. A new read classifies a concurrent insert.
      try {
        const existing = await findExisting(input.repository, prepared);
        if (existing) {
          return duplicateResult(existing.id, prepared, warnings);
        }
      } catch (classificationError) {
        throw asSaveError(classificationError);
      }
    }
    throw asSaveError(error);
  }
}

type Prepared = {
  dto: PreRaceSnapshotDto;
  sourceRaceKey: string;
  fingerprint: string;
};

function prepare(dto: PreRaceSnapshotDto, sourceRaceKey: string): Prepared {
  try {
    const validated = preRaceSnapshotSchema.parse(dto);
    if (typeof sourceRaceKey !== "string" || sourceRaceKey.trim().length === 0) {
      throw new Error("sourceRaceKey must not be empty");
    }
    if (validated.entries.length !== validated.race.declaredEntries) {
      throw new Error("entries.length must equal declaredEntries");
    }
    const horseNumbers = validated.entries.map((entry) => entry.horseNumber);
    if (new Set(horseNumbers).size !== horseNumbers.length) {
      throw new Error("horseNumber must be unique within a snapshot");
    }
    return {
      dto: validated,
      sourceRaceKey,
      fingerprint: createPreRaceSnapshotFingerprint(validated, sourceRaceKey),
    };
  } catch (error) {
    throw new SnapshotSaveError(
      "validation_error",
      error instanceof Error ? error.message : "Invalid pre-race snapshot",
    );
  }
}

async function findExisting(
  reader: SnapshotReader,
  prepared: Prepared,
): Promise<ExistingSnapshot | null> {
  const byFingerprint = await reader.findByFingerprint(prepared.fingerprint);
  if (byFingerprint) {
    await assertEntryCount(reader, byFingerprint.id, prepared.dto.entries.length);
    return byFingerprint;
  }

  if (prepared.dto.observation.timeStatus === "known") {
    const byKnownKey = await reader.findKnownSnapshotByKey({
      providerCode: prepared.dto.providerCode,
      sourceRaceKey: prepared.sourceRaceKey,
      observedAt: prepared.dto.observation.observedAt,
      schemaVersion: prepared.dto.schemaVersion,
    });
    if (byKnownKey) {
      if (byKnownKey.fingerprint !== prepared.fingerprint) {
        throw new SnapshotSaveError(
          "unique_conflict",
          "The known observation key exists with different snapshot content",
        );
      }
      await assertEntryCount(reader, byKnownKey.id, prepared.dto.entries.length);
      return byKnownKey;
    }
  }

  return null;
}

async function assertEntryCount(
  reader: SnapshotReader,
  snapshotId: string,
  expectedCount: number,
): Promise<void> {
  if (await reader.countEntrySnapshots(snapshotId) !== expectedCount) {
    throw new SnapshotSaveError(
      "transaction_error",
      "Existing snapshot entry count does not match the DTO",
    );
  }
}

type ResolvedEntryIds = {
  raceEntryId: string | null;
  horseId: string | null;
  jockeyId: string | null;
  trainerId: string | null;
};

async function resolveIds(reader: SnapshotReader, dto: PreRaceSnapshotDto) {
  const race = await reader.resolveRace({
    raceDate: dto.race.raceDate,
    venue: dto.race.venue,
    raceNumber: dto.race.raceNumber,
  });
  const warnings: ResolutionWarning[] = race ? [] : [{ code: "race_not_resolved" }];
  const entries: ResolvedEntryIds[] = [];

  for (const entry of dto.entries) {
    const candidate = race
      ? await reader.resolveRaceEntry(race.id, entry.horseNumber)
      : null;
    const matched = candidate && sameName(candidate.horse?.displayName, entry.horse.displayName)
      ? candidate
      : null;
    if (!matched) {
      warnings.push({ code: "race_entry_not_resolved", horseNumber: entry.horseNumber });
    }

    const horseId = matched?.horse?.id ?? null;
    const jockeyId = matched && sameName(matched.jockey?.displayName, entry.jockey.displayName)
      ? matched.jockey!.id
      : null;
    const trainerId = entry.trainer && matched
      && sameName(matched.trainer?.displayName, entry.trainer.displayName)
      ? matched.trainer!.id
      : null;

    if (!horseId) warnings.push({ code: "horse_not_resolved", horseNumber: entry.horseNumber });
    if (!jockeyId) warnings.push({ code: "jockey_not_resolved", horseNumber: entry.horseNumber });
    if (entry.trainer && !trainerId) {
      warnings.push({ code: "trainer_not_resolved", horseNumber: entry.horseNumber });
    }

    entries.push({
      raceEntryId: matched?.id ?? null,
      horseId,
      jockeyId,
      trainerId,
    });
  }

  return { raceId: race?.id ?? null, entries, warnings };
}

function sameName(candidate: string | undefined, expected: string): boolean {
  return candidate !== undefined
    && candidate.normalize("NFKC").trim() === expected.normalize("NFKC").trim();
}

function makeSnapshotRow(prepared: Prepared, raceId: string | null): SnapshotInsert {
  const { dto } = prepared;
  const known = dto.observation.timeStatus === "known";
  return {
    providerCode: dto.providerCode,
    raceId,
    sourceRaceKey: prepared.sourceRaceKey,
    raceDate: dto.race.raceDate,
    venue: dto.race.venue,
    raceNumber: dto.race.raceNumber,
    scheduledStartAt: dto.race.scheduledStartAt,
    surface: dto.race.surface,
    distanceMeters: dto.race.distanceMeters,
    declaredEntries: dto.race.declaredEntries,
    observedAt: dto.observation.observedAt,
    observationTimeStatus: dto.observation.timeStatus,
    schemaVersion: dto.schemaVersion,
    sourceFileName: dto.source.fileName,
    sourceChecksum: dto.source.checksum,
    snapshotFingerprint: prepared.fingerprint,
    isFeatureEligible: known,
    eligibilityReason: known ? null : "observation_time_unknown",
  };
}

function makeEntryRows(
  prepared: Prepared,
  snapshotId: string,
  resolved: ResolvedEntryIds[],
): EntrySnapshotInsert[] {
  return prepared.dto.entries.map((entry, index) => ({
    preRaceSnapshotId: snapshotId,
    ...resolved[index],
    sourceEntryKey: `v1:${JSON.stringify([
      prepared.dto.providerCode,
      prepared.sourceRaceKey,
      entry.horseNumber,
    ])}`,
    frameNumber: entry.frameNumber,
    horseNumber: entry.horseNumber,
    horseNameRaw: entry.horse.displayName,
    jockeyNameRaw: entry.jockey.displayName,
    trainerNameRaw: entry.trainer?.displayName ?? null,
    sex: entry.sex,
    age: entry.age,
    assignedWeight: entry.assignedWeight,
    interval: entry.interval,
    zi: entry.zi,
    rawFieldsJson: entry.raw,
  }));
}

function duplicateResult(
  snapshotId: string,
  prepared: Prepared,
  warnings: ResolutionWarning[],
): SaveResult {
  return {
    status: "duplicate",
    snapshotId,
    entryCount: prepared.dto.entries.length,
    fingerprint: prepared.fingerprint,
    warnings,
  };
}

function asSaveError(error: unknown): SnapshotSaveError {
  if (error instanceof SnapshotSaveError) return error;
  return new SnapshotSaveError(
    "transaction_error",
    error instanceof Error ? error.message : "Snapshot save failed",
  );
}
