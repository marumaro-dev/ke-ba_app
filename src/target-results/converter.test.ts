import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseCsv } from "../db/csv-import/csv-parser";
import { convertTargetResults } from "./converter";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("convertTargetResults", () => {
  it("converts one synthetic race into six referentially consistent CSV files", async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "target-results-"));
    temporaryDirectories.push(temporaryDirectory);
    const outputDir = path.join(temporaryDirectory, "output");

    const result = await convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/single-race.synthetic.txt"),
      outputDir,
      providerCode: "jra_van",
      raceDate: "2026-06-14",
      venue: "架空競馬場",
      venueCode: "synthetic",
      asOfAt: "2026-06-14T18:00:00+09:00",
    });

    expect(result.rowCounts).toEqual({
      races: 1,
      horses: 3,
      jockeys: 3,
      trainers: 3,
      raceEntries: 3,
      raceResults: 3,
    });

    const raceRows = await readRows(outputDir, "races.sample.csv");
    const horseRows = await readRows(outputDir, "horses.sample.csv");
    const jockeyRows = await readRows(outputDir, "jockeys.sample.csv");
    const trainerRows = await readRows(outputDir, "trainers.sample.csv");
    const entryRows = await readRows(outputDir, "race_entries.sample.csv");
    const resultRows = await readRows(outputDir, "race_results.sample.csv");

    expect(raceRows[0].values.source_race_id).toBe("jra_van_20260614_synthetic_1");
    expect(raceRows[0].values.track_condition).toBe("稍重");
    expect(horseRows.every((row) => /^jra_van_horse_h_[a-f0-9]{24}$/.test(row.values.source_horse_id))).toBe(true);
    expect(jockeyRows.every((row) => /^jra_van_jockey_h_[a-f0-9]{24}$/.test(row.values.source_jockey_id))).toBe(true);
    expect(trainerRows.every((row) => /^jra_van_trainer_h_[a-f0-9]{24}$/.test(row.values.source_trainer_id))).toBe(true);

    const raceIds = new Set(raceRows.map((row) => row.values.source_race_id));
    const horseIds = new Set(horseRows.map((row) => row.values.source_horse_id));
    const jockeyIds = new Set(jockeyRows.map((row) => row.values.source_jockey_id));
    const trainerIds = new Set(trainerRows.map((row) => row.values.source_trainer_id));
    const entryIds = new Set(entryRows.map((row) => row.values.source_entry_id));

    expect(entryRows.every((row) => raceIds.has(row.values.source_race_id))).toBe(true);
    expect(entryRows.every((row) => horseIds.has(row.values.source_horse_id))).toBe(true);
    expect(entryRows.every((row) => jockeyIds.has(row.values.source_jockey_id))).toBe(true);
    expect(entryRows.every((row) => trainerIds.has(row.values.source_trainer_id))).toBe(true);
    expect(resultRows.every((row) => entryIds.has(row.values.source_entry_id))).toBe(true);
    expect(resultRows.map((row) => row.values.finish_status)).toEqual([
      "finished",
      "did_not_finish",
      "scratched",
    ]);
    expect(resultRows[0].values.finish_time_milliseconds).toBe("95900");
    expect(resultRows[1].values.finish_time_milliseconds).toBe("");
    expect(raceRows[0].values.scheduled_start_at).toBe("2026-06-14T00:00:00+09:00");
  });

  it("enriches a race start time from a matching synthetic entries file", async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "target-results-"));
    temporaryDirectories.push(temporaryDirectory);
    const result = await convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/single-race.synthetic.txt"),
      entriesFile: path.join(process.cwd(), "src/target-results/fixtures/entries-start-times.synthetic.txt"),
      outputDir: path.join(temporaryDirectory, "output"),
      providerCode: "jra_van",
      raceDate: "2026-06-14",
      venue: "架空競馬場",
      venueCode: "synthetic",
      asOfAt: "2026-06-14T18:00:00+09:00",
    });

    expect(result.rowCounts.races).toBe(1);
    const raceRows = await readRows(result.outputDir, "races.sample.csv");
    expect(raceRows[0].values.scheduled_start_at).toBe("2026-06-14T10:00:00+09:00");
  });

  it.each([
    ["date mismatch", (text: string) => text.replace("2026年 6月14日", "2026年 6月15日"), "date or venue"],
    ["venue mismatch", (text: string) => text.replace("1回架空競馬場", "1回空想競馬場"), "date or venue"],
    ["missing race number", (text: string) => text.replace("\n1R\n", "\n2R\n"), "missing race 1"],
    ["duplicate race number", (text: string) => `${text}\n${text}`, "duplicate race number 1"],
  ])("rejects entries with %s", async (_label, mutate, message) => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "target-results-"));
    temporaryDirectories.push(temporaryDirectory);
    const fixture = await readFile(
      path.join(process.cwd(), "src/target-results/fixtures/entries-start-times.synthetic.txt"), "utf8",
    );
    const entriesFile = path.join(temporaryDirectory, "entries.synthetic.txt");
    await writeFile(entriesFile, mutate(fixture));

    await expect(convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/single-race.synthetic.txt"),
      entriesFile,
      outputDir: path.join(temporaryDirectory, "output"),
      providerCode: "jra_van",
      raceDate: "2026-06-14",
      venue: "架空競馬場",
      venueCode: "synthetic",
      asOfAt: "2026-06-14T18:00:00+09:00",
    })).rejects.toThrow(message);
  });

  it("converts multiple synthetic races and deduplicates shared entities", async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "target-results-"));
    temporaryDirectories.push(temporaryDirectory);
    const outputDir = path.join(temporaryDirectory, "output");

    const result = await convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/multi-race.synthetic.txt"),
      outputDir,
      providerCode: "jra_van",
      raceDate: "2026-06-14",
      venue: "架空競馬場",
      venueCode: "synthetic",
      asOfAt: "2026-06-14T18:00:00+09:00",
    });

    expect(result.rowCounts).toEqual({
      races: 2,
      horses: 6,
      jockeys: 5,
      trainers: 5,
      raceEntries: 6,
      raceResults: 6,
    });

    const raceRows = await readRows(outputDir, "races.sample.csv");
    const horseRows = await readRows(outputDir, "horses.sample.csv");
    const jockeyRows = await readRows(outputDir, "jockeys.sample.csv");
    const trainerRows = await readRows(outputDir, "trainers.sample.csv");
    const entryRows = await readRows(outputDir, "race_entries.sample.csv");
    const resultRows = await readRows(outputDir, "race_results.sample.csv");

    expect(raceRows.map((row) => row.values.source_race_id)).toEqual([
      "jra_van_20260614_synthetic_1",
      "jra_van_20260614_synthetic_2",
    ]);
    expect(raceRows.map((row) => row.values.track_condition)).toEqual(["良", "重"]);
    expect(new Set(jockeyRows.map((row) => row.values.source_jockey_id)).size).toBe(5);
    expect(new Set(trainerRows.map((row) => row.values.source_trainer_id)).size).toBe(5);
    expectReferentialIntegrity({ raceRows, horseRows, jockeyRows, trainerRows, entryRows, resultRows });
    expect(resultRows.map((row) => row.values.finish_status)).toContain("disqualified");

    // Start-time parsing is intentionally deferred; all races use the documented fallback for now.
    expect(new Set(raceRows.map((row) => row.values.scheduled_start_at)).size).toBe(1);
  });

  it("keeps an excluded entry distinct from a scratched entry without inventing a result", async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "target-results-"));
    temporaryDirectories.push(temporaryDirectory);
    const outputDir = path.join(temporaryDirectory, "output");

    const result = await convertTargetResults({
      input: path.join(process.cwd(), "src/target-results/fixtures/excluded.synthetic.txt"),
      outputDir,
      providerCode: "jra_van",
      raceDate: "2026-06-14",
      venue: "架空競馬場",
      venueCode: "synthetic",
      asOfAt: "2026-06-14T18:00:00+09:00",
    });

    expect(result.rowCounts.raceEntries).toBe(2);
    expect(result.rowCounts.raceResults).toBe(1);
    const entryRows = await readRows(outputDir, "race_entries.sample.csv");
    const resultRows = await readRows(outputDir, "race_results.sample.csv");
    expect(entryRows.map((row) => row.values.status)).toEqual(["running", "excluded"]);
    expect(resultRows.map((row) => row.values.source_entry_id)).toEqual([entryRows[0].values.source_entry_id]);
    expect(resultRows[0].values.finish_status).toBe("finished");
  });
});

function expectReferentialIntegrity(rows: {
  raceRows: Awaited<ReturnType<typeof readRows>>;
  horseRows: Awaited<ReturnType<typeof readRows>>;
  jockeyRows: Awaited<ReturnType<typeof readRows>>;
  trainerRows: Awaited<ReturnType<typeof readRows>>;
  entryRows: Awaited<ReturnType<typeof readRows>>;
  resultRows: Awaited<ReturnType<typeof readRows>>;
}) {
  const raceIds = new Set(rows.raceRows.map((row) => row.values.source_race_id));
  const horseIds = new Set(rows.horseRows.map((row) => row.values.source_horse_id));
  const jockeyIds = new Set(rows.jockeyRows.map((row) => row.values.source_jockey_id));
  const trainerIds = new Set(rows.trainerRows.map((row) => row.values.source_trainer_id));
  const entryIds = new Set(rows.entryRows.map((row) => row.values.source_entry_id));

  expect(rows.entryRows.every((row) => raceIds.has(row.values.source_race_id))).toBe(true);
  expect(rows.entryRows.every((row) => horseIds.has(row.values.source_horse_id))).toBe(true);
  expect(rows.entryRows.every((row) => jockeyIds.has(row.values.source_jockey_id))).toBe(true);
  expect(rows.entryRows.every((row) => trainerIds.has(row.values.source_trainer_id))).toBe(true);
  expect(rows.resultRows.every((row) => entryIds.has(row.values.source_entry_id))).toBe(true);
}

async function readRows(directory: string, fileName: string) {
  return parseCsv(await readFile(path.join(directory, fileName), "utf8"));
}
