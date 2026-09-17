import { describe, expect, it } from "vitest";

import { bundleFiles } from "./versioning";
import { buildTimestampContractApplyPlan, compareTimestampContractBundles,
  timestampsRepresentSameInstant } from "./timestamp-contract";

const payloadByFile: Record<string, Record<string, string>> = {
  "races.sample.csv": { name: "Synthetic Race", race_date: "2027-01-01", venue: "Synthetic Venue", provider_code: "synthetic", source_race_id: "r1" },
  "horses.sample.csv": { name: "Fictional Horse", provider_code: "synthetic", source_horse_id: "h1" },
  "jockeys.sample.csv": { name: "Fictional Rider", provider_code: "synthetic", source_jockey_id: "j1" },
  "trainers.sample.csv": { name: "Fictional Trainer", provider_code: "synthetic", source_trainer_id: "t1" },
  "race_entries.sample.csv": { status: "entered", provider_code: "synthetic", source_entry_id: "e1", source_race_id: "r1" },
  "race_results.sample.csv": { finish_status: "finished", provider_code: "synthetic", source_result_id: "z1", source_entry_id: "e1" },
};

function bundle() {
  return Object.fromEntries(bundleFiles.map((file) => {
    const row = { id: "00000000-0000-4000-8000-000000000001", ...payloadByFile[file],
      available_at: "2027-01-01T09:00:00Z", observed_at: "2027-01-01T09:00:00Z" };
    return [file, { headers: Object.keys(row), rows: [row] }];
  })) as Record<string, { headers: string[]; rows: Record<string, string>[] }>;
}

describe("strict timestamp contract comparison", () => {
  it("compares timestamp instants without rounding or accepting invalid dates", () => {
    expect(timestampsRepresentSameInstant("2026-06-20T00:55:00.000Z", "2026-06-20 00:55:00+00")).toBe(true);
    expect(timestampsRepresentSameInstant("2026-06-20T00:55:00.000Z", "2026-06-20 09:55:00+09")).toBe(true);
    expect(timestampsRepresentSameInstant(null, "")).toBe(true);
    expect(timestampsRepresentSameInstant(null, "2026-06-20T00:55:00Z")).toBe(false);
    expect(timestampsRepresentSameInstant("2026-06-20T00:55:00.000Z", "2026-06-20T00:55:00.001Z")).toBe(false);
    expect(timestampsRepresentSameInstant("2026-06-20T00:55:00Z", "2026-06-20T00:55:01Z")).toBe(false);
    expect(() => timestampsRepresentSameInstant("2026-02-30T00:00:00Z", "2026-02-30T00:00:00Z"))
      .toThrow("timestamp_contract_invalid_timestamp");
  });

  it("keeps equivalent timestamp text existing_same but treats status differences as contract changes", () => {
    const previous = bundle(); const candidate = structuredClone(previous);
    candidate["races.sample.csv"].rows[0].available_at = "2027-01-01 09:00:00+00";
    candidate["races.sample.csv"].rows[0].observed_at = "2027-01-01 18:00:00+09";
    expect(compareTimestampContractBundles(previous, candidate).status).toBe("existing_same");
    previous["races.sample.csv"].headers.push("available_at_status");
    candidate["races.sample.csv"].headers.push("available_at_status");
    previous["races.sample.csv"].rows[0].available_at_status = "known";
    candidate["races.sample.csv"].rows[0].available_at_status = "unknown";
    expect(compareTimestampContractBundles(previous, candidate).status).toBe("timestamp_contract_only");
  });
  it("keeps identical bundles existing_same and ignores row order", () => {
    const previous = bundle();
    const candidate = structuredClone(previous);
    for (const table of Object.values(candidate)) {
      const second = { ...table.rows[0], id: "00000000-0000-4000-8000-000000000002" };
      table.rows.push(second);
      table.rows.reverse();
    }
    for (const table of Object.values(previous)) {
      table.rows.push({ ...table.rows[0], id: "00000000-0000-4000-8000-000000000002" });
    }
    expect(compareTimestampContractBundles(previous, candidate).status).toBe("existing_same");
  });

  it.each(["available_at", "observed_at"])("accepts %s alone", (key) => {
    const previous = bundle(); const candidate = structuredClone(previous);
    candidate["races.sample.csv"].rows[0][key] = "";
    expect(compareTimestampContractBundles(previous, candidate).status).toBe("timestamp_contract_only");
  });

  it("accepts added status columns and all four time changes", () => {
    const previous = bundle(); const candidate = structuredClone(previous);
    for (const table of Object.values(candidate)) {
      table.headers.push("available_at_status", "observed_at_status");
      Object.assign(table.rows[0], { available_at: "", available_at_status: "unknown",
        observed_at: "", observed_at_status: "unknown" });
    }
    const result = compareTimestampContractBundles(previous, candidate);
    expect(result.status).toBe("timestamp_contract_only");
    expect(result.tables.every((table) => table.safeToApply && table.timestampOnlyRows === 1)).toBe(true);
    const plan = buildTimestampContractApplyPlan(result);
    expect(plan).toHaveLength(6);
    expect(Object.keys(plan[0].update).sort()).toEqual([
      "available_at", "available_at_status", "observed_at", "observed_at_status",
    ].sort());
    expect(JSON.stringify(plan)).not.toContain("name");
  });

  it.each([
    ["races.sample.csv", "name", "Different Race"],
    ["horses.sample.csv", "name", "Different Horse"],
    ["race_results.sample.csv", "finish_status", "disqualified"],
  ])("rejects non-time payload changes in %s", (file, key, value) => {
    const previous = bundle(); const candidate = structuredClone(previous);
    candidate[file].rows[0][key] = value;
    const result = compareTimestampContractBundles(previous, candidate);
    expect(result.status).toBe("existing_data_conflict");
    expect(result.safeToApply).toBe(false);
    expect(result.tables.find((table) => table.table === file.replace(".sample.csv", ""))?.payloadMismatchRows).toBe(1);
  });

  it("rejects missing IDs, added IDs and row count changes", () => {
    const previous = bundle();
    const missing = structuredClone(previous);
    missing["horses.sample.csv"].rows = [];
    expect(compareTimestampContractBundles(previous, missing).tables[1].missingIds).toBe(1);
    const extra = structuredClone(previous);
    extra["horses.sample.csv"].rows.push({ ...extra["horses.sample.csv"].rows[0], id: "extra" });
    expect(compareTimestampContractBundles(previous, extra).tables[1].extraIds).toBe(1);
    expect(compareTimestampContractBundles(previous, extra).safeToApply).toBe(false);
  });

  it("rejects unexpected non-time columns", () => {
    const previous = bundle(); const candidate = structuredClone(previous);
    candidate["jockeys.sample.csv"].headers.push("new_payload");
    candidate["jockeys.sample.csv"].rows[0].new_payload = "x";
    expect(compareTimestampContractBundles(previous, candidate).status).toBe("existing_data_conflict");
  });
});
