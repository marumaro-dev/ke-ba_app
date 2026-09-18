import { describe, expect, it } from "vitest";

import { resolveInternalId } from "../db/csv-import/ids";
import type { PreRaceEntryDto, PreRaceSnapshotDto } from "../pre-race-snapshots/types";
import { planProjectedSafeFk, type PersistedMasters, type ProjectedCsvRows } from "./projected-fk";

const row = (source: string, extra: Record<string, string>) => ({ id: "", provider_code: "jra_van",
  [source]: extra[source], ...extra });
const bundle: ProjectedCsvRows = {
  races: [row("source_race_id", { source_race_id: "synthetic-race", race_date: "2027-02-01",
    venue: "架空競馬場", race_number: "1" })],
  horses: [
    row("source_horse_id", { source_horse_id: "synthetic-horse-1", name: "架空馬甲",
      birth_date: "", sex: "male", color: "" }),
    row("source_horse_id", { source_horse_id: "synthetic-horse-2", name: "$架空馬乙",
      birth_date: "", sex: "female", color: "" }),
  ],
  jockeys: [
    row("source_jockey_id", { source_jockey_id: "synthetic-jockey-1", name: "架空騎手甲" }),
    row("source_jockey_id", { source_jockey_id: "synthetic-jockey-2", name: "架空騎手乙" }),
  ],
  trainers: [row("source_trainer_id", { source_trainer_id: "synthetic-trainer",
    name: "架空調教師", affiliation: "栗東" })],
  raceEntries: [
    row("source_entry_id", { source_entry_id: "synthetic-entry-1",
      source_race_id: "synthetic-race", source_horse_id: "synthetic-horse-1",
      source_jockey_id: "synthetic-jockey-1", source_trainer_id: "synthetic-trainer",
      horse_number: "1" }),
    row("source_entry_id", { source_entry_id: "synthetic-entry-2",
      source_race_id: "synthetic-race", source_horse_id: "synthetic-horse-2",
      source_jockey_id: "synthetic-jockey-2", source_trainer_id: "synthetic-trainer",
      horse_number: "2" }),
  ],
};

function entry(horseNumber: number, horseName: string, jockeyName: string,
  marker: string | null = null): PreRaceEntryDto {
  return {
    frameNumber: horseNumber, horseNumber,
    horse: { displayName: horseName, internalId: null, providerEntityId: null },
    jockey: { displayName: jockeyName, internalId: null, providerEntityId: null },
    trainer: null, sex: "male", age: 3, assignedWeight: 57, interval: null, zi: null,
    raw: { horseNumberMarker: marker, sexAgeMarker: null, weightAllowanceMarker: null,
      intervalMarker: null, ziMarker: null, targetFields: {
        B: null, 直前: null, 芝短: null, 芝中: null, ダ短: null, ダ中: null, 脚: null,
      }, odds: { value: null, observedAt: null, featureEligible: false,
        reason: "observation_time_unknown" } },
  };
}

const dto: PreRaceSnapshotDto = {
  schemaVersion: "pre-race-snapshot-v1", providerCode: "jra_van",
  observation: { observedAt: null, timeStatus: "unknown" },
  source: { fileName: null, checksum: null },
  race: { raceDate: "2027-02-01", venue: "架空競馬場", raceNumber: 1,
    scheduledStartAt: "2027-02-01T10:00:00+09:00", surface: "turf",
    distanceMeters: 1600, declaredEntries: 2 },
  entries: [entry(1, "架空馬甲", "架空騎手甲"), entry(2, "架空馬乙", "騎手乙", "$")],
};
const empty: PersistedMasters = { horses: [], jockeys: [], trainers: [] };

describe("projected SAFE FK planning", () => {
  it("resolves planned races, entries and exact horses including raw marker restoration", async () => {
    const plan = await planProjectedSafeFk(bundle, [dto], empty);
    expect(plan.parent).toMatchObject({ target: 1, resolved: 1, conflict: 0 });
    expect(plan.child).toMatchObject({ target: 2, raceEntryResolved: 2,
      horseResolved: 2, jockeyResolved: 1, trainerResolved: 0, conflict: 0 });
  });

  it("restores an asterisk marker only for an exact complete horse name", async () => {
    const markedBundle: ProjectedCsvRows = { ...bundle, horses: [bundle.horses[0],
      { ...bundle.horses[1], name: "*架空馬乙" }] };
    const markedDto: PreRaceSnapshotDto = { ...dto, entries: [dto.entries[0],
      { ...dto.entries[1], raw: { ...dto.entries[1].raw, horseNumberMarker: "*" } }] };
    const plan = await planProjectedSafeFk(markedBundle, [markedDto], empty);
    expect(plan.child.horseResolved).toBe(2);
  });

  it("does not guess horse or jockey links from non-identical names", async () => {
    const changed: PreRaceSnapshotDto = { ...dto, entries: [
      { ...dto.entries[0], horse: { ...dto.entries[0].horse, displayName: "別の架空馬" } },
      dto.entries[1],
    ] };
    const plan = await planProjectedSafeFk(bundle, [changed], empty);
    expect(plan.child).toMatchObject({ raceEntryResolved: 1, horseResolved: 1,
      jockeyResolved: 0, trainerResolved: 0 });
  });

  it("reuses an existing shared master by ID without comparing timestamp columns", async () => {
    const horseId = resolveInternalId("", "jra_van", "horse", "synthetic-horse-1");
    const persisted: PersistedMasters = { ...empty, horses: [{ id: horseId,
      name: "架空馬甲", birthDate: null, sex: "male", color: null }] };
    const plan = await planProjectedSafeFk(bundle, [dto], persisted);
    expect(plan.child.horseResolved).toBe(2);
  });

  it("rejects a non-timestamp payload mismatch for a shared master", async () => {
    const horseId = resolveInternalId("", "jra_van", "horse", "synthetic-horse-1");
    const persisted: PersistedMasters = { ...empty, horses: [{ id: horseId,
      name: "別名", birthDate: null, sex: "male", color: null }] };
    await expect(planProjectedSafeFk(bundle, [dto], persisted))
      .rejects.toThrow("projected_master_payload_conflict");
  });
});
