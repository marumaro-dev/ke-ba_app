import { resolveInternalId, toExternalKey } from "../db/csv-import/ids";
import { planPreRaceLinkBackfill, type LinkChild, type LinkParent } from "../pre-race-snapshots/backfill";
import type { PreRaceSnapshotDto } from "../pre-race-snapshots/types";
import type { ResolvedRaceEntry } from "../pre-race-snapshots/save";

type CsvRow = Record<string, string>;
export type ProjectedCsvRows = {
  races: CsvRow[];
  horses: CsvRow[];
  jockeys: CsvRow[];
  trainers: CsvRow[];
  raceEntries: CsvRow[];
};
export type PersistedMasters = {
  horses: Array<{ id: string; name: string; birthDate: string | null;
    sex: string | null; color: string | null }>;
  jockeys: Array<{ id: string; name: string }>;
  trainers: Array<{ id: string; name: string; affiliation: string | null }>;
};

const key = (row: CsvRow, sourceField: string) => toExternalKey(row.provider_code, row[sourceField]);
const id = (row: CsvRow, entity: "race" | "race_entry" | "horse" | "jockey" | "trainer",
  sourceField: string) => resolveInternalId(row.id, row.provider_code, entity, row[sourceField]);
const optional = (value: string) => value === "" ? null : value;

export function projectedMasterIds(rows: ProjectedCsvRows) {
  return {
    horses: rows.horses.map((row) => id(row, "horse", "source_horse_id")),
    jockeys: rows.jockeys.map((row) => id(row, "jockey", "source_jockey_id")),
    trainers: rows.trainers.map((row) => id(row, "trainer", "source_trainer_id")),
  };
}

export function projectedDayIds(rows: ProjectedCsvRows) {
  return {
    races: rows.races.map((row) => id(row, "race", "source_race_id")),
    raceEntries: rows.raceEntries.map((row) => id(row, "race_entry", "source_entry_id")),
  };
}

/** Overlay a validated CSV bundle on persisted masters, then reuse the actual SAFE planner. */
export async function planProjectedSafeFk(
  rows: ProjectedCsvRows,
  dtos: PreRaceSnapshotDto[],
  persisted: PersistedMasters,
) {
  const horseById = new Map(persisted.horses.map((row) => [row.id, row]));
  const jockeyById = new Map(persisted.jockeys.map((row) => [row.id, row]));
  const trainerById = new Map(persisted.trainers.map((row) => [row.id, row]));
  const raceBySource = new Map<string, { id: string; raceDate: string; venue: string; raceNumber: number }>();
  const raceByNatural = new Map<string, { id: string }>();
  const horseBySource = new Map<string, { id: string; name: string }>();
  const jockeyBySource = new Map<string, { id: string; name: string }>();
  const trainerBySource = new Map<string, { id: string; name: string }>();
  const entryByRaceAndNumber = new Map<string, ResolvedRaceEntry>();

  for (const row of rows.horses) {
    const internalId = id(row, "horse", "source_horse_id");
    const existing = horseById.get(internalId);
    if (existing && (existing.name !== row.name || existing.birthDate !== optional(row.birth_date)
      || existing.sex !== optional(row.sex) || existing.color !== optional(row.color))) {
      throw new Error("projected_master_payload_conflict");
    }
    horseBySource.set(key(row, "source_horse_id"), { id: internalId, name: existing?.name ?? row.name });
  }
  for (const row of rows.jockeys) {
    const internalId = id(row, "jockey", "source_jockey_id");
    const existing = jockeyById.get(internalId);
    if (existing && existing.name !== row.name) throw new Error("projected_master_payload_conflict");
    jockeyBySource.set(key(row, "source_jockey_id"), { id: internalId, name: existing?.name ?? row.name });
  }
  for (const row of rows.trainers) {
    const internalId = id(row, "trainer", "source_trainer_id");
    const existing = trainerById.get(internalId);
    if (existing && (existing.name !== row.name || existing.affiliation !== optional(row.affiliation))) {
      throw new Error("projected_master_payload_conflict");
    }
    trainerBySource.set(key(row, "source_trainer_id"), { id: internalId, name: existing?.name ?? row.name });
  }
  for (const row of rows.races) {
    const race = { id: id(row, "race", "source_race_id"), raceDate: row.race_date,
      venue: row.venue, raceNumber: Number(row.race_number) };
    const natural = `${race.raceDate}:${race.venue}:${race.raceNumber}`;
    if (raceByNatural.has(natural)) throw new Error("projected_race_duplicate");
    raceByNatural.set(natural, { id: race.id });
    raceBySource.set(key(row, "source_race_id"), race);
  }
  for (const row of rows.raceEntries) {
    const race = raceBySource.get(key(row, "source_race_id"));
    const horse = horseBySource.get(key(row, "source_horse_id"));
    const jockey = jockeyBySource.get(key(row, "source_jockey_id"));
    const trainer = trainerBySource.get(key(row, "source_trainer_id"));
    if (!race || !horse || !jockey || !trainer) throw new Error("projected_reference_missing");
    const natural = `${race.id}:${row.horse_number}`;
    if (entryByRaceAndNumber.has(natural)) throw new Error("projected_entry_duplicate");
    entryByRaceAndNumber.set(natural, {
      id: id(row, "race_entry", "source_entry_id"),
      horse: { id: horse.id, displayName: horse.name },
      jockey: { id: jockey.id, displayName: jockey.name },
      trainer: { id: trainer.id, displayName: trainer.name },
    });
  }

  const parents: LinkParent[] = [];
  const children: LinkChild[] = [];
  for (const dto of dtos) {
    const parentId = `planned:${dto.race.raceDate}:${dto.race.venue}:${dto.race.raceNumber}`;
    parents.push({ id: parentId, raceDate: dto.race.raceDate, venue: dto.race.venue,
      raceNumber: dto.race.raceNumber, declaredEntries: dto.race.declaredEntries, raceId: null });
    for (const entry of dto.entries) {
      children.push({ id: `${parentId}:${entry.horseNumber}`, preRaceSnapshotId: parentId,
        horseNumber: entry.horseNumber, horseNameRaw: entry.horse.displayName,
        jockeyNameRaw: entry.jockey.displayName, rawHorseNumberMarker: entry.raw.horseNumberMarker,
        raceEntryId: null, horseId: null, jockeyId: null, trainerId: null });
    }
  }
  return planPreRaceLinkBackfill(parents, children, {
    async resolveRace(race) {
      return raceByNatural.get(`${race.raceDate}:${race.venue}:${race.raceNumber}`) ?? null;
    },
    async resolveRaceEntry(raceId, horseNumber) {
      return entryByRaceAndNumber.get(`${raceId}:${horseNumber}`) ?? null;
    },
  });
}
