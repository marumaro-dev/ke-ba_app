import { and, count, eq } from "drizzle-orm";

import {
  SnapshotUniqueConstraintError,
  type EntrySnapshotInsert,
  type ExistingSnapshot,
  type KnownSnapshotKey,
  type ResolvedRaceEntry,
  type SnapshotInsert,
  type SnapshotReader,
  type SnapshotRepository,
  type SnapshotTransaction,
} from "../pre-race-snapshots/save";
import type { getDb } from "./index";
import {
  horses,
  jockeys,
  preRaceEntrySnapshots,
  preRaceSnapshots,
  raceEntries,
  races,
  trainers,
} from "./schema";

type Database = ReturnType<typeof getDb>;
type QueryClient = Pick<Database, "select" | "insert">;

const parentUniqueConstraints = new Set([
  "pre_race_snapshots_fingerprint_unique",
  "pre_race_snapshots_source_observed_version_unique",
]);

export class RepositoryInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryInvariantError";
  }
}

/** The caller owns the injected client and its connection lifecycle. */
export function createPreRaceSnapshotRepository(db: Database): SnapshotRepository {
  return {
    ...createReader(db),
    async runInTransaction<T>(
      callback: (transaction: SnapshotTransaction) => Promise<T>,
    ): Promise<T> {
      try {
        return await db.transaction(async (tx) => callback(createTransaction(tx)));
      } catch (error) {
        // Classification happens only after the transaction has rolled back.
        if (isParentUniqueViolation(error)) {
          throw new SnapshotUniqueConstraintError();
        }
        throw error;
      }
    },
  };
}

function createReader(client: QueryClient): SnapshotReader {
  return {
    async findByFingerprint(fingerprint: string): Promise<ExistingSnapshot | null> {
      const rows = await client
        .select({ id: preRaceSnapshots.id, fingerprint: preRaceSnapshots.snapshotFingerprint })
        .from(preRaceSnapshots)
        .where(eq(preRaceSnapshots.snapshotFingerprint, fingerprint))
        .limit(2);
      return atMostOne(rows, "snapshot fingerprint");
    },

    async findKnownSnapshotByKey(key: KnownSnapshotKey): Promise<ExistingSnapshot | null> {
      const rows = await client
        .select({ id: preRaceSnapshots.id, fingerprint: preRaceSnapshots.snapshotFingerprint })
        .from(preRaceSnapshots)
        .where(and(
          eq(preRaceSnapshots.providerCode, key.providerCode),
          eq(preRaceSnapshots.sourceRaceKey, key.sourceRaceKey),
          eq(preRaceSnapshots.observedAt, toDate(key.observedAt)),
          eq(preRaceSnapshots.schemaVersion, key.schemaVersion),
        ))
        .limit(2);
      return atMostOne(rows, "known snapshot key");
    },

    async resolveRace(key): Promise<{ id: string } | null> {
      const rows = await client
        .select({ id: races.id })
        .from(races)
        .where(and(
          eq(races.raceDate, key.raceDate),
          eq(races.venue, key.venue),
          eq(races.raceNumber, key.raceNumber),
        ))
        .limit(2);
      return atMostOne(rows, "race natural key");
    },

    async resolveRaceEntry(raceId: string, horseNumber: number): Promise<ResolvedRaceEntry | null> {
      const rows = await client
        .select({
          id: raceEntries.id,
          horseId: horses.id,
          horseName: horses.name,
          jockeyId: jockeys.id,
          jockeyName: jockeys.name,
          trainerId: trainers.id,
          trainerName: trainers.name,
        })
        .from(raceEntries)
        .leftJoin(horses, eq(raceEntries.horseId, horses.id))
        .leftJoin(jockeys, eq(raceEntries.jockeyId, jockeys.id))
        .leftJoin(trainers, eq(raceEntries.trainerId, trainers.id))
        .where(and(
          eq(raceEntries.raceId, raceId),
          eq(raceEntries.horseNumber, horseNumber),
        ))
        .limit(2);
      const row = atMostOne(rows, "race entry natural key");
      if (!row) return null;
      return {
        id: row.id,
        horse: row.horseId && row.horseName
          ? { id: row.horseId, displayName: row.horseName }
          : null,
        jockey: row.jockeyId && row.jockeyName
          ? { id: row.jockeyId, displayName: row.jockeyName }
          : null,
        trainer: row.trainerId && row.trainerName
          ? { id: row.trainerId, displayName: row.trainerName }
          : null,
      };
    },

    async countEntrySnapshots(snapshotId: string): Promise<number> {
      const rows = await client
        .select({ value: count() })
        .from(preRaceEntrySnapshots)
        .where(eq(preRaceEntrySnapshots.preRaceSnapshotId, snapshotId));
      const value = Number(rows[0]?.value);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RepositoryInvariantError("Invalid snapshot entry count");
      }
      return value;
    },
  };
}

function createTransaction(client: QueryClient): SnapshotTransaction {
  return {
    ...createReader(client),

    async insertSnapshot(row: SnapshotInsert): Promise<string> {
      const inserted = await client
        .insert(preRaceSnapshots)
        .values({
          ...row,
          scheduledStartAt: toDate(row.scheduledStartAt),
          observedAt: row.observedAt === null ? null : toDate(row.observedAt),
        })
        .returning({ id: preRaceSnapshots.id });
      if (inserted.length !== 1 || !inserted[0]?.id) {
        throw new RepositoryInvariantError("Snapshot insert did not return one ID");
      }
      return inserted[0].id;
    },

    async insertEntrySnapshots(rows: EntrySnapshotInsert[]): Promise<void> {
      if (rows.length === 0) {
        throw new RepositoryInvariantError("Entry snapshot bulk insert cannot be empty");
      }
      const values = rows.map((row) => ({
        ...row,
        assignedWeight: toExactNumeric(row.assignedWeight, 4, 1, "assignedWeight"),
        zi: row.zi === null ? null : toExactNumeric(row.zi, 10, 3, "zi"),
      }));
      await client.insert(preRaceEntrySnapshots).values(values);
    },
  };
}

function atMostOne<T>(rows: readonly T[], key: string): T | null {
  if (rows.length > 1) {
    throw new RepositoryInvariantError(`Multiple rows found for ${key}`);
  }
  return rows[0] ?? null;
}

function toDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RepositoryInvariantError("Invalid snapshot timestamp");
  }
  return date;
}

function toExactNumeric(value: number, precision: number, scale: number, field: string): string {
  if (!Number.isFinite(value)) {
    throw new RepositoryInvariantError(`Invalid ${field} numeric value`);
  }
  const text = value.toString();
  const match = /^-?(\d+)(?:\.(\d+))?$/.exec(text);
  const integerDigits = match?.[1].replace(/^0+/, "").length ?? 0;
  const fractionalDigits = match?.[2]?.length ?? 0;
  if (!match || integerDigits > precision - scale || fractionalDigits > scale) {
    throw new RepositoryInvariantError(`${field} exceeds numeric(${precision},${scale})`);
  }
  return text;
}

function isParentUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const details = current as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    const constraint = details.constraint_name ?? details.constraint;
    if (details.code === "23505" && typeof constraint === "string") {
      return parentUniqueConstraints.has(constraint);
    }
    current = details.cause;
  }
  return false;
}
