import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateCsvBundle } from "../db/csv-import/importer";
import { parseCsv } from "../db/csv-import/csv-parser";
import { mapTargetEntriesToPreRaceSnapshots } from "../pre-race-snapshots/mapper";
import { parseTargetEntriesBytes } from "../target-entries/parser";
import { convertTargetResults } from "../target-results/converter";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("offline bundle validation", () => {
  it("checks all six CSVs and their references without a DB connection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "synthetic-bundle-validation-"));
    roots.push(root);
    const outputDir = path.join(root, "bundle");
    await convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/single-race.synthetic.txt"),
      outputDir, providerCode: "jra_van", raceDate: "2026-06-14",
      venue: "架空競馬場", venueCode: "synthetic",
    });
    const report = await validateCsvBundle(outputDir);
    expect(report.rowCounts).toMatchObject({ races: 1, raceEntries: 3, raceResults: 3 });
    expect(report.races.map((race) => race.raceNumber)).toEqual([1]);
    for (const file of ["races", "horses", "jockeys", "trainers", "race_entries", "race_results"]) {
      const rows = parseCsv(await readFile(path.join(outputDir, `${file}.sample.csv`), "utf8"));
      expect(rows.every((row) => row.values.available_at === ""
        && row.values.available_at_status === "unknown"
        && row.values.observed_at === ""
        && row.values.observed_at_status === "unknown")).toBe(true);
    }
  });

  it("never promotes the parser-only timestamp or raw odds into ML eligibility", async () => {
    const bytes = await import("node:fs/promises").then((fs) => fs.readFile(
      path.join(process.cwd(), "src/target-entries/fixtures/single-race.synthetic.txt")));
    const parsed = parseTargetEntriesBytes(bytes, { observedAt: "1970-01-01T00:00:00Z" });
    const dtos = mapTargetEntriesToPreRaceSnapshots(parsed, {
      observation: { observedAt: null, timeStatus: "unknown" },
      source: { fileName: null, checksum: null },
    });
    expect(dtos).toHaveLength(1);
    expect(dtos[0].observation).toEqual({ observedAt: null, timeStatus: "unknown" });
    expect(dtos[0].entries.every((entry) => entry.raw.odds.observedAt === null
      && entry.raw.odds.featureEligible === false)).toBe(true);
  });
});
