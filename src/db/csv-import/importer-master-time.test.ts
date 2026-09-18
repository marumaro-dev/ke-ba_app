import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";

import { horses, jockeys, raceEntries, raceResults, races, trainers } from "../schema";
import { toImportTimeColumns, withoutMasterSourceTimes } from "./importer";

const id = "00000000-0000-4000-8000-000000000001";
const earlier = new Date("2027-01-01T08:00:00Z");
const later = new Date("2027-01-08T08:00:00Z");
const known = toImportTimeColumns({ available_at: later, available_at_status: "known",
  observed_at: later, observed_at_status: "known" });
const unknown = toImportTimeColumns({ available_at: null, available_at_status: "unknown",
  observed_at: null, observed_at_status: "unknown" });
const timeColumns = ["available_at", "available_at_status", "observed_at", "observed_at_status"];

describe("shared master import-time policy", () => {
  it("inserts all four source-time columns for new horse, jockey and trainer rows", () => {
    const callback = vi.fn(async () => ({ rows: [] }));
    const db = drizzle(callback);
    const queries = [
      db.insert(horses).values({ id, name: "Fictional Horse", ...known }).toSQL().sql,
      db.insert(jockeys).values({ id, name: "Fictional Rider", ...known }).toSQL().sql,
      db.insert(trainers).values({ id, name: "Fictional Trainer", ...known }).toSQL().sql,
    ];
    for (const query of queries) {
      for (const column of timeColumns) expect(query).toContain(`"${column}"`);
    }
    expect(callback).not.toHaveBeenCalled();
  });

  it("excludes source times only from the conflict SET for all three masters", () => {
    const callback = vi.fn(async () => ({ rows: [] }));
    const db = drizzle(callback);
    const queries = [
      db.insert(horses).values({ id, name: "Fictional Horse", ...known })
        .onConflictDoUpdate({ target: horses.id, set: withoutMasterSourceTimes({
          name: "Renamed Horse", birthDate: null, sex: null, color: null,
          ...known, importedAt: later, updatedAt: later,
        }) }).toSQL().sql,
      db.insert(jockeys).values({ id, name: "Fictional Rider", ...known })
        .onConflictDoUpdate({ target: jockeys.id, set: withoutMasterSourceTimes({
          name: "Renamed Rider", ...known, importedAt: later, updatedAt: later,
        }) }).toSQL().sql,
      db.insert(trainers).values({ id, name: "Fictional Trainer", ...known })
        .onConflictDoUpdate({ target: trainers.id, set: withoutMasterSourceTimes({
          name: "Renamed Trainer", affiliation: "Fictional Stable",
          ...known, importedAt: later, updatedAt: later,
        }) }).toSQL().sql,
    ];
    for (const query of queries) {
      const update = query.split(" do update set ")[1];
      expect(update).toBeDefined();
      for (const column of timeColumns) expect(update).not.toContain(`"${column}"`);
      expect(update).toContain('"name"');
      expect(update).toContain('"imported_at"');
      expect(update).toContain('"updated_at"');
    }
    expect(queries[2].split(" do update set ")[1]).toContain('"affiliation"');
    expect(callback).not.toHaveBeenCalled();
  });

  it("keeps prior known or unknown values across later-day reimports", () => {
    for (const [before, incoming] of [[{
      availableAt: earlier, availableAtStatus: "known" as const,
      observedAt: earlier, observedAtStatus: "known" as const,
    }, unknown], [unknown, known]] as const) {
      const oldRow = { name: "Original", ...before };
      const update = withoutMasterSourceTimes({ name: "Updated", ...incoming });
      expect({ ...oldRow, ...update }).toEqual({ ...oldRow, name: "Updated" });
      for (const key of Object.keys(incoming)) expect(update).not.toHaveProperty(key);
    }
  });

  it("leaves date-scoped race, entry and result conflict SETs time-aware", () => {
    const callback = vi.fn(async () => ({ rows: [] }));
    const db = drizzle(callback);
    const queries = [
      db.insert(races).values({ id, raceDate: "2027-01-01", venue: "Fictional Venue",
        raceNumber: 1, name: "Fictional Race", scheduledStartAt: later,
        surface: "turf", distanceMeters: 1600, ...known })
        .onConflictDoUpdate({ target: races.id, set: { ...unknown } }).toSQL().sql,
      db.insert(raceEntries).values({ id, raceId: id, horseId: id, jockeyId: id,
        trainerId: id, frameNumber: 1, horseNumber: 1, assignedWeight: "57.0", ...known })
        .onConflictDoUpdate({ target: raceEntries.id, set: { ...unknown } }).toSQL().sql,
      db.insert(raceResults).values({ id, raceEntryId: id, ...known })
        .onConflictDoUpdate({ target: raceResults.id, set: { ...unknown } }).toSQL().sql,
    ];
    for (const query of queries) {
      const update = query.split(" do update set ")[1];
      for (const column of timeColumns) expect(update).toContain(`"${column}"`);
    }
    expect(callback).not.toHaveBeenCalled();
  });
});
