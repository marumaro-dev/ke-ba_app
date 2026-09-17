import { describe, expect, it, vi } from "vitest";

import {
  SnapshotUniqueConstraintError,
  type EntrySnapshotInsert,
  type SnapshotInsert,
} from "../pre-race-snapshots/save";
import {
  createPreRaceSnapshotRepository,
  RepositoryInvariantError,
} from "./pre-race-snapshot-repository";

type InjectedDb = Parameters<typeof createPreRaceSnapshotRepository>[0];

function selectClient(rows: unknown[]) {
  const limit = vi.fn(async () => rows);
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit }) }),
  }));
  return { select, limit };
}

function entryRow(overrides: Partial<EntrySnapshotInsert> = {}): EntrySnapshotInsert {
  return {
    preRaceSnapshotId: "synthetic-snapshot",
    raceEntryId: null,
    horseId: null,
    jockeyId: null,
    trainerId: null,
    sourceEntryKey: "synthetic-entry",
    frameNumber: 1,
    horseNumber: 2,
    horseNameRaw: "架空馬甲",
    jockeyNameRaw: "架空騎手甲",
    trainerNameRaw: null,
    sex: "male",
    age: 3,
    assignedWeight: 55.5,
    interval: null,
    zi: 123.456,
    rawFieldsJson: {
      horseNumberMarker: null,
      sexAgeMarker: null,
      weightAllowanceMarker: null,
      intervalMarker: null,
      ziMarker: null,
      targetFields: { B: null, 直前: null, 芝短: null, 芝中: null, ダ短: null, ダ中: null, 脚: null },
      odds: { value: null, observedAt: null, featureEligible: false, reason: "observation_time_unknown" },
    },
    ...overrides,
  };
}

describe("createPreRaceSnapshotRepository", () => {
  it("uses the injected client and refuses ambiguous lookup results", async () => {
    const client = selectClient([{ id: "synthetic-id", fingerprint: "synthetic-fingerprint" }]);
    const repository = createPreRaceSnapshotRepository(client as unknown as InjectedDb);
    await expect(repository.findByFingerprint("synthetic-fingerprint")).resolves.toEqual({
      id: "synthetic-id",
      fingerprint: "synthetic-fingerprint",
    });
    expect(client.select).toHaveBeenCalledOnce();
    expect(client.limit).toHaveBeenCalledWith(2);

    const ambiguous = createPreRaceSnapshotRepository(
      selectClient([{ id: "a" }, { id: "b" }]) as unknown as InjectedDb,
    );
    await expect(ambiguous.resolveRace({
      raceDate: "2027-02-01", venue: "架空場", raceNumber: 1,
    })).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("passes a transaction-scoped reader to the callback", async () => {
    const tx = selectClient([{ id: "tx-id", fingerprint: "tx-fingerprint" }]);
    const outerSelect = vi.fn(() => { throw new Error("outer client must not be read"); });
    const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    const repository = createPreRaceSnapshotRepository({
      select: outerSelect,
      transaction,
    } as unknown as InjectedDb);

    const found = await repository.runInTransaction(
      (scoped) => scoped.findByFingerprint("tx-fingerprint"),
    );
    expect(found?.id).toBe("tx-id");
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledOnce();
    expect(outerSelect).not.toHaveBeenCalled();
  });

  it.each([
    "pre_race_snapshots_fingerprint_unique",
    "pre_race_snapshots_source_observed_version_unique",
  ])("converts parent unique violation %s after transaction failure", async (constraint_name) => {
    const transaction = vi.fn(async () => {
      throw { code: "23505", constraint_name };
    });
    const repository = createPreRaceSnapshotRepository({ transaction } as unknown as InjectedDb);
    await expect(repository.runInTransaction(async () => "unreachable"))
      .rejects.toBeInstanceOf(SnapshotUniqueConstraintError);
  });

  it("preserves non-parent unique violations", async () => {
    const failure = { code: "23505", constraint_name: "pre_race_entry_snapshots_snapshot_horse_number_unique" };
    const repository = createPreRaceSnapshotRepository({
      transaction: async () => { throw failure; },
    } as unknown as InjectedDb);
    await expect(repository.runInTransaction(async () => "unreachable")).rejects.toBe(failure);
  });

  it("bulk inserts exact numeric strings without rounding", async () => {
    const values = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values }));
    const repository = createPreRaceSnapshotRepository({
      transaction: async (callback: (tx: { insert: typeof insert }) => Promise<unknown>) => callback({ insert }),
    } as unknown as InjectedDb);

    await repository.runInTransaction((tx) => tx.insertEntrySnapshots([entryRow()]));
    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith([expect.objectContaining({
      assignedWeight: "55.5",
      zi: "123.456",
      rawFieldsJson: entryRow().rawFieldsJson,
    })]);
  });

  it.each([
    { assignedWeight: 55.55 },
    { assignedWeight: 1000 },
    { zi: 12.3456 },
    { zi: 10000000 },
  ])("rejects numeric precision loss before insert: %j", async (override) => {
    const insert = vi.fn(() => { throw new Error("insert should not run"); });
    const repository = createPreRaceSnapshotRepository({
      transaction: async (callback: (tx: { insert: typeof insert }) => Promise<unknown>) => callback({ insert }),
    } as unknown as InjectedDb);

    await expect(repository.runInTransaction((tx) => tx.insertEntrySnapshots([entryRow(override)])))
      .rejects.toBeInstanceOf(RepositoryInvariantError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("converts parent timestamps and leaves generated columns to the DB", async () => {
    const returning = vi.fn(async () => [{ id: "synthetic-snapshot" }]);
    const values = vi.fn((_row: Record<string, unknown>) => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const repository = createPreRaceSnapshotRepository({
      transaction: async (callback: (tx: { insert: typeof insert }) => Promise<unknown>) => callback({ insert }),
    } as unknown as InjectedDb);
    const row: SnapshotInsert = {
      providerCode: "jra_van", raceId: null, sourceRaceKey: "synthetic-race",
      raceDate: "2027-02-01", venue: "架空場", raceNumber: 1,
      scheduledStartAt: "2027-02-01T12:00:00+09:00", surface: "turf",
      distanceMeters: 1600, declaredEntries: 1,
      observedAt: "2027-02-01T11:00:00+09:00", observationTimeStatus: "known",
      schemaVersion: "pre-race-snapshot-v1", sourceFileName: null, sourceChecksum: null,
      snapshotFingerprint: "a".repeat(64), isFeatureEligible: true, eligibilityReason: null,
    };

    await expect(repository.runInTransaction((tx) => tx.insertSnapshot(row)))
      .resolves.toBe("synthetic-snapshot");
    const inserted = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.scheduledStartAt).toBeInstanceOf(Date);
    expect(inserted.observedAt).toBeInstanceOf(Date);
    expect(inserted).not.toHaveProperty("id");
    expect(inserted).not.toHaveProperty("createdAt");
  });
});
