import { describe, expect, it } from "vitest";

import { persistedMismatchCounts } from "./preview-adapter";

describe("persisted timestamp-contract safety check", () => {
  it("reads shared masters strictly by ID and payload, not by their timestamps", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const bundle = { "horses.sample.csv": { rows: [{ id, name: "Fictional Horse",
      birth_date: "", sex: "", color: "",
      available_at: "2027-01-01T09:00:00Z", observed_at: "2027-01-01T09:00:00Z" }] } };
    const stored = { id, name: "Fictional Horse", birth_date: null, sex: null, color: null,
      available_at: null, observed_at: null };
    const read = async () => [stored];
    expect(await persistedMismatchCounts(bundle, read)).toEqual({ horses: 0 });
    expect(await persistedMismatchCounts(bundle, async () => [{ ...stored, name: "Another Horse" }]))
      .toEqual({ horses: 1 });
    expect(await persistedMismatchCounts(bundle, async () => [])).toEqual({ horses: 1 });
  });

  it("still checks date-scoped timestamps by instant", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    const bundle = { "races.sample.csv": { rows: [{ id, race_date: "2027-01-01",
      venue: "Fictional Venue", race_number: "1", name: "Fictional Race",
      scheduled_start_at: "2027-01-01T09:30:00Z", surface: "turf",
      distance_meters: "1600", weather: "", track_condition: "", status: "scheduled",
      available_at: "2027-01-01T09:00:00Z", observed_at: "2027-01-01T09:00:00Z" }] } };
    const stored = { id, race_date: "2027-01-01", venue: "Fictional Venue", race_number: 1,
      name: "Fictional Race", scheduled_start_at: new Date("2027-01-01T09:30:00Z"),
      surface: "turf", distance_meters: 1600, weather: null, track_condition: null,
      status: "scheduled", available_at: "2027-01-01 18:00:00+09",
      observed_at: "2027-01-01 18:00:00+09" };
    expect(await persistedMismatchCounts(bundle, async () => [stored])).toEqual({ races: 0 });
    expect(await persistedMismatchCounts(bundle, async () => [{ ...stored,
      observed_at: "2027-01-01T09:00:00.001Z" }])).toEqual({ races: 1 });
  });
});
