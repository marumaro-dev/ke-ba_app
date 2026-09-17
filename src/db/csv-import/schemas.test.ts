import { describe, expect, it } from "vitest";

import { raceEntryCsvSchema } from "./schemas";
import { toImportTimeColumns } from "./importer";

describe("csv import schemas", () => {
  it("validates and normalizes optional numeric fields", () => {
    const parsed = raceEntryCsvSchema.parse({
      id: "",
      provider_code: "licensed_csv_demo",
      source_entry_id: "ENTRY-001",
      source_race_id: "RACE-001",
      source_horse_id: "HORSE-001",
      source_jockey_id: "JOCKEY-001",
      source_trainer_id: "TRAINER-001",
      frame_number: "1",
      horse_number: "2",
      assigned_weight: "57.0",
      body_weight: "",
      body_weight_diff: "",
      status: "entered",
      available_at: "2026-06-26T12:00:00+09:00",
      available_at_status: "known",
      observed_at: "2026-06-26T12:10:00+09:00",
      observed_at_status: "known",
      imported_at: "",
    });

    expect(parsed.id).toBeUndefined();
    expect(parsed.body_weight).toBeNull();
    expect(parsed.body_weight_diff).toBeNull();
    expect(parsed.available_at).toBeInstanceOf(Date);
  });

  it("rejects invalid enum values with row-level validation errors", () => {
    expect(() =>
      raceEntryCsvSchema.parse({
        id: "",
        provider_code: "licensed_csv_demo",
        source_entry_id: "ENTRY-001",
        source_race_id: "RACE-001",
        source_horse_id: "HORSE-001",
        source_jockey_id: "JOCKEY-001",
        source_trainer_id: "TRAINER-001",
        frame_number: "1",
        horse_number: "2",
        assigned_weight: "57.0",
        body_weight: "",
        body_weight_diff: "",
        status: "unknown",
        available_at: "2026-06-26T12:00:00+09:00",
        available_at_status: "known",
        observed_at: "2026-06-26T12:10:00+09:00",
        observed_at_status: "known",
        imported_at: "",
      }),
    ).toThrow();
  });

  it.each([
    ["known/known", "2026-06-26T12:00:00+09:00", "known", "2026-06-26T12:10:00+09:00", "known", true],
    ["known/null", "", "known", "", "unknown", false],
    ["unknown/null", "", "unknown", "", "unknown", true],
    ["unknown/timestamp", "2026-06-26T12:00:00+09:00", "unknown", "", "unknown", false],
    ["available only", "2026-06-26T12:00:00+09:00", "known", "", "unknown", true],
    ["observed only", "", "unknown", "2026-06-26T12:10:00+09:00", "known", true],
    ["observed mismatch", "", "unknown", "2026-06-26T12:10:00+09:00", "unknown", false],
    ["timezone missing", "2026-06-26T12:00:00", "known", "", "unknown", false],
  ])("validates independent source times: %s", (_name, availableAt, availableStatus,
    observedAt, observedStatus, valid) => {
    const parsed = raceEntryCsvSchema.safeParse({
      id: "", provider_code: "synthetic", source_entry_id: "ENTRY-001",
      source_race_id: "RACE-001", source_horse_id: "HORSE-001",
      source_jockey_id: "JOCKEY-001", source_trainer_id: "TRAINER-001",
      frame_number: "1", horse_number: "2", assigned_weight: "57.0",
      body_weight: "", body_weight_diff: "", status: "entered",
      available_at: availableAt, available_at_status: availableStatus,
      observed_at: observedAt, observed_at_status: observedStatus, imported_at: "",
    });
    expect(parsed.success).toBe(valid);
  });

  it("maps known and unknown CSV times to importer columns without defaults", () => {
    expect(toImportTimeColumns({
      available_at: null, available_at_status: "unknown",
      observed_at: null, observed_at_status: "unknown",
    })).toEqual({
      availableAt: null, availableAtStatus: "unknown",
      observedAt: null, observedAtStatus: "unknown",
    });
    const known = new Date("2026-06-26T03:00:00Z");
    expect(toImportTimeColumns({
      available_at: known, available_at_status: "known",
      observed_at: known, observed_at_status: "known",
    })).toEqual({
      availableAt: known, availableAtStatus: "known",
      observedAt: known, observedAtStatus: "known",
    });
  });
});
