import { describe, expect, it } from "vitest";

import { raceEntryCsvSchema } from "./schemas";

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
      observed_at: "2026-06-26T12:10:00+09:00",
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
        observed_at: "2026-06-26T12:10:00+09:00",
        imported_at: "",
      }),
    ).toThrow();
  });
});
