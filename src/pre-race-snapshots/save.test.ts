import { describe, expect, it } from "vitest";

import { createPreRaceSnapshotFingerprint } from "./fingerprint";
import {
  savePreRaceSnapshot,
  SnapshotUniqueConstraintError,
  type EntrySnapshotInsert,
  type ExistingSnapshot,
  type KnownSnapshotKey,
  type ResolvedRaceEntry,
  type SnapshotInsert,
  type SnapshotRepository,
  type SnapshotTransaction,
} from "./save";
import type { Observation, PreRaceEntryDto, PreRaceSnapshotDto } from "./types";

const sourceRaceKey = "jra_van_20270201_fictional_1";

describe("savePreRaceSnapshot", () => {
  it("returns would_insert on dry-run without calling transaction or writes", async () => {
    const repository = new MemoryRepository();
    const result = await savePreRaceSnapshot(input(repository, "dry_run"));

    expect(result).toMatchObject({ status: "would_insert", snapshotId: null, entryCount: 2 });
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(repository.transactions).toBe(0);
    expect(repository.parentInserts).toBe(0);
    expect(repository.childInserts).toBe(0);
  });

  it("saves one parent and all children in one transaction", async () => {
    const repository = new MemoryRepository();
    const result = await savePreRaceSnapshot(input(repository, "save"));

    expect(result).toMatchObject({ status: "inserted", snapshotId: "snapshot-1", entryCount: 2 });
    expect(repository.transactions).toBe(1);
    expect(repository.parentInserts).toBe(1);
    expect(repository.childInserts).toBe(2);
    expect(repository.insertedParent?.raceId).toBe("race-1");
    expect(repository.insertedChildren).toHaveLength(2);
    expect(repository.insertedChildren[0]).toMatchObject({
      raceEntryId: "entry-1",
      horseId: "horse-1",
      jockeyId: "jockey-1",
      trainerId: "trainer-1",
    });
  });

  it("returns duplicate with the existing ID and does not insert", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto();
    repository.addExisting("existing-1", createPreRaceSnapshotFingerprint(dto, sourceRaceKey), 2);

    const result = await savePreRaceSnapshot(input(repository, "save", dto));

    expect(result).toMatchObject({ status: "duplicate", snapshotId: "existing-1", entryCount: 2 });
    expect(repository.parentInserts).toBe(0);
    expect(repository.childInserts).toBe(0);
  });

  it("treats the same known key and fingerprint as a duplicate", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto({ timeStatus: "known", observedAt: "2027-02-01T09:00:00+09:00" });
    repository.addExisting(
      "existing-1",
      createPreRaceSnapshotFingerprint(dto, sourceRaceKey),
      2,
      knownKey(dto),
    );
    repository.skipFingerprintLookup = true;

    const result = await savePreRaceSnapshot(input(repository, "save", dto));

    expect(result.status).toBe("duplicate");
    expect(repository.parentInserts).toBe(0);
  });

  it("rejects a known-key conflict without inserting or overwriting", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto({ timeStatus: "known", observedAt: "2027-02-01T09:00:00+09:00" });
    repository.addExisting("existing-1", "different-fingerprint", 2, knownKey(dto));

    await expect(savePreRaceSnapshot(input(repository, "save", dto))).rejects.toMatchObject({
      code: "unique_conflict",
    });
    expect(repository.parentInserts).toBe(0);
    expect(repository.childInserts).toBe(0);
  });

  it("marks an unknown observation as ineligible", async () => {
    const repository = new MemoryRepository();
    await savePreRaceSnapshot(input(repository, "save"));

    expect(repository.insertedParent).toMatchObject({
      observedAt: null,
      observationTimeStatus: "unknown",
      isFeatureEligible: false,
      eligibilityReason: "observation_time_unknown",
    });
  });

  it("marks a known pre-start observation as eligible", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto({ timeStatus: "known", observedAt: "2027-02-01T09:00:00+09:00" });
    await savePreRaceSnapshot(input(repository, "save", dto));

    expect(repository.insertedParent).toMatchObject({
      isFeatureEligible: true,
      eligibilityReason: null,
    });
  });

  it("rejects a post-start known observation before any repository call", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto({ timeStatus: "known", observedAt: "2027-02-01T10:00:00+09:00" });

    await expect(savePreRaceSnapshot(input(repository, "save", dto))).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repository.calls).toBe(0);
  });

  it("rejects a declared-count mismatch and post-race fields before writes", async () => {
    const repository = new MemoryRepository();
    const mismatch = makeDto();
    mismatch.race.declaredEntries = 3;
    await expect(savePreRaceSnapshot(input(repository, "save", mismatch))).rejects.toMatchObject({
      code: "validation_error",
    });

    const withResult = makeDto() as PreRaceSnapshotDto & { finishPosition?: number };
    withResult.finishPosition = 1;
    await expect(savePreRaceSnapshot(input(repository, "save", withResult))).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repository.calls).toBe(0);
  });

  it("rejects duplicate horse numbers before repository writes", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto();
    dto.entries[1].horseNumber = dto.entries[0].horseNumber;

    await expect(savePreRaceSnapshot(input(repository, "save", dto))).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(repository.calls).toBe(0);
  });

  it("continues with nullable IDs and machine-readable warnings", async () => {
    const repository = new MemoryRepository();
    repository.raceAvailable = false;

    const result = await savePreRaceSnapshot(input(repository, "save"));

    expect(result.status).toBe("inserted");
    expect(result.warnings.map((warning) => warning.code)).toContain("race_not_resolved");
    expect(result.warnings.map((warning) => warning.code)).toContain("horse_not_resolved");
    expect(result.warnings.map((warning) => warning.code)).toContain("jockey_not_resolved");
    expect(repository.insertedParent?.raceId).toBeNull();
    expect(repository.insertedChildren[0]).toMatchObject({
      raceEntryId: null,
      horseId: null,
      jockeyId: null,
      trainerId: null,
    });
  });

  it("does not link a jockey whose name differs from the DTO", async () => {
    const repository = new MemoryRepository();
    repository.jockeyNameOverride = "別の架空騎手";

    const result = await savePreRaceSnapshot(input(repository, "save"));

    expect(result.warnings).toContainEqual({ code: "jockey_not_resolved", horseNumber: 1 });
    expect(repository.insertedChildren[0].jockeyId).toBeNull();
  });

  it("rolls back when the saved child count differs", async () => {
    const repository = new MemoryRepository();
    repository.countOverride = 1;

    await expect(savePreRaceSnapshot(input(repository, "save"))).rejects.toMatchObject({
      code: "transaction_error",
    });
    expect(repository.rollbacks).toBe(1);
    expect(repository.snapshots.size).toBe(0);
    expect(repository.children.size).toBe(0);
  });

  it("changes the fingerprint when sourceRaceKey changes", async () => {
    const dto = makeDto();
    const first = await savePreRaceSnapshot(input(new MemoryRepository(), "dry_run", dto));
    const second = await savePreRaceSnapshot({
      ...input(new MemoryRepository(), "dry_run", dto),
      sourceRaceKey: `${sourceRaceKey}_other`,
    });

    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("generates an unambiguous deterministic source entry key", async () => {
    const firstRepo = new MemoryRepository();
    const secondRepo = new MemoryRepository();
    const key = "source|with|separator";
    await savePreRaceSnapshot({ ...input(firstRepo, "save"), sourceRaceKey: key });
    await savePreRaceSnapshot({ ...input(secondRepo, "save"), sourceRaceKey: key });

    const first = firstRepo.insertedChildren.map((row) => row.sourceEntryKey);
    const second = secondRepo.insertedChildren.map((row) => row.sourceEntryKey);
    expect(first).toEqual(second);
    expect(first).toEqual([
      `v1:${JSON.stringify(["jra_van", key, 1])}`,
      `v1:${JSON.stringify(["jra_van", key, 2])}`,
    ]);
  });

  it("classifies a concurrent unique violation after rollback", async () => {
    const repository = new MemoryRepository();
    const dto = makeDto();
    repository.concurrentInsert = {
      id: "concurrent-1",
      fingerprint: createPreRaceSnapshotFingerprint(dto, sourceRaceKey),
      entryCount: 2,
    };

    const result = await savePreRaceSnapshot(input(repository, "save", dto));

    expect(result).toMatchObject({ status: "duplicate", snapshotId: "concurrent-1" });
    expect(repository.rollbacks).toBe(1);
  });
});

function input(
  repository: MemoryRepository,
  mode: "dry_run" | "save",
  dto = makeDto(),
) {
  return { dto, sourceRaceKey, repository, mode };
}

function knownKey(dto: PreRaceSnapshotDto): KnownSnapshotKey {
  if (dto.observation.timeStatus !== "known") throw new Error("Expected known observation");
  return {
    providerCode: dto.providerCode,
    sourceRaceKey,
    observedAt: dto.observation.observedAt,
    schemaVersion: dto.schemaVersion,
  };
}

class MemoryRepository implements SnapshotRepository, SnapshotTransaction {
  snapshots = new Map<string, { existing: ExistingSnapshot; key: KnownSnapshotKey | null }>();
  children = new Map<string, EntrySnapshotInsert[]>();
  presetCounts = new Map<string, number>();
  transactions = 0;
  rollbacks = 0;
  parentInserts = 0;
  childInserts = 0;
  calls = 0;
  insertedParent: SnapshotInsert | null = null;
  insertedChildren: EntrySnapshotInsert[] = [];
  raceAvailable = true;
  jockeyNameOverride: string | null = null;
  countOverride: number | null = null;
  skipFingerprintLookup = false;
  concurrentInsert: { id: string; fingerprint: string; entryCount: number } | null = null;

  addExisting(
    id: string,
    fingerprint: string,
    entryCount: number,
    key: KnownSnapshotKey | null = null,
  ) {
    this.snapshots.set(id, { existing: { id, fingerprint }, key });
    this.presetCounts.set(id, entryCount);
  }

  async findByFingerprint(fingerprint: string): Promise<ExistingSnapshot | null> {
    this.calls += 1;
    if (this.skipFingerprintLookup) return null;
    return [...this.snapshots.values()].find((row) => row.existing.fingerprint === fingerprint)
      ?.existing ?? null;
  }

  async findKnownSnapshotByKey(key: KnownSnapshotKey): Promise<ExistingSnapshot | null> {
    this.calls += 1;
    return [...this.snapshots.values()].find((row) => row.key
      && row.key.providerCode === key.providerCode
      && row.key.sourceRaceKey === key.sourceRaceKey
      && row.key.observedAt === key.observedAt
      && row.key.schemaVersion === key.schemaVersion)?.existing ?? null;
  }

  async resolveRace(): Promise<{ id: string } | null> {
    this.calls += 1;
    return this.raceAvailable ? { id: "race-1" } : null;
  }

  async resolveRaceEntry(
    _raceId: string,
    horseNumber: number,
  ): Promise<ResolvedRaceEntry | null> {
    this.calls += 1;
    return {
      id: `entry-${horseNumber}`,
      horse: { id: `horse-${horseNumber}`, displayName: `架空馬${horseNumber}` },
      jockey: {
        id: `jockey-${horseNumber}`,
        displayName: this.jockeyNameOverride ?? `架空騎手${horseNumber}`,
      },
      trainer: { id: `trainer-${horseNumber}`, displayName: "架空調教師" },
    };
  }

  async countEntrySnapshots(snapshotId: string): Promise<number> {
    this.calls += 1;
    return this.countOverride ?? this.presetCounts.get(snapshotId)
      ?? this.children.get(snapshotId)?.length ?? 0;
  }

  async insertSnapshot(row: SnapshotInsert): Promise<string> {
    this.calls += 1;
    this.parentInserts += 1;
    if (this.concurrentInsert) throw new SnapshotUniqueConstraintError();
    const id = `snapshot-${this.parentInserts}`;
    this.insertedParent = row;
    this.snapshots.set(id, {
      existing: { id, fingerprint: row.snapshotFingerprint },
      key: row.observedAt ? {
        providerCode: row.providerCode,
        sourceRaceKey: row.sourceRaceKey,
        observedAt: row.observedAt,
        schemaVersion: row.schemaVersion,
      } : null,
    });
    return id;
  }

  async insertEntrySnapshots(rows: EntrySnapshotInsert[]): Promise<void> {
    this.calls += 1;
    this.childInserts += rows.length;
    this.insertedChildren = rows;
    this.children.set(rows[0].preRaceSnapshotId, rows);
  }

  async runInTransaction<T>(callback: (transaction: SnapshotTransaction) => Promise<T>): Promise<T> {
    this.calls += 1;
    this.transactions += 1;
    const beforeSnapshots = new Map(this.snapshots);
    const beforeChildren = new Map(this.children);
    try {
      return await callback(this);
    } catch (error) {
      this.snapshots = beforeSnapshots;
      this.children = beforeChildren;
      this.rollbacks += 1;
      if (this.concurrentInsert) {
        const { id, fingerprint, entryCount } = this.concurrentInsert;
        this.addExisting(id, fingerprint, entryCount);
      }
      throw error;
    }
  }
}

function makeDto(
  observation: Observation = { timeStatus: "unknown", observedAt: null },
): PreRaceSnapshotDto {
  return {
    schemaVersion: "pre-race-snapshot-v1",
    providerCode: "jra_van",
    observation,
    source: { fileName: "synthetic-entries.txt", checksum: null },
    race: {
      raceDate: "2027-02-01",
      venue: "架空競馬場",
      raceNumber: 1,
      scheduledStartAt: "2027-02-01T10:00:00+09:00",
      surface: "turf",
      distanceMeters: 1600,
      declaredEntries: 2,
    },
    entries: [makeEntry(1), makeEntry(2)],
  };
}

function makeEntry(horseNumber: number): PreRaceEntryDto {
  return {
    frameNumber: horseNumber,
    horseNumber,
    horse: { internalId: null, providerEntityId: null, displayName: `架空馬${horseNumber}` },
    jockey: { internalId: null, providerEntityId: null, displayName: `架空騎手${horseNumber}` },
    trainer: { internalId: null, providerEntityId: null, displayName: "架空調教師" },
    sex: "male",
    age: 3,
    assignedWeight: 57,
    interval: null,
    zi: 100,
    raw: {
      horseNumberMarker: null,
      sexAgeMarker: null,
      weightAllowanceMarker: null,
      intervalMarker: "連",
      ziMarker: null,
      targetFields: { B: null, 直前: null, 芝短: null, 芝中: null, ダ短: null, ダ中: null, 脚: null },
      odds: {
        value: 2.5,
        observedAt: null,
        featureEligible: false,
        reason: "observation_time_unknown",
      },
    },
  };
}
