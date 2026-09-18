import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseTargetEntriesBytes, parseTargetEntriesText } from "./parser";

const observedAt = "2027-01-10T08:30:00+09:00";

describe("parseTargetEntriesBytes", () => {
  it("parses a synthetic pre-race entry table without exposing the result column", async () => {
    const parsed = await parseFixture("single-race.synthetic.txt", observedAt);

    expect(parsed.observedAt).toBe("2027-01-09T23:30:00.000Z");
    expect(parsed.races).toHaveLength(1);
    expect(parsed.races[0]).toMatchObject({
      raceDate: "2027-01-10",
      venue: "架空競馬場",
      raceNumber: 1,
      scheduledStartAt: "2027-01-10T10:00:00+09:00",
      surface: "turf",
      distanceMeters: 1600,
      declaredEntries: 3,
    });
    expect(parsed.races[0].entries).toHaveLength(3);

    const [first, second, third] = parsed.races[0].entries;
    expect(first).toMatchObject({
      frameNumber: 1,
      horseNumber: 1,
      horseName: "架空馬アルファ",
      sex: "male",
      age: 3,
      jockeyName: "架空甲",
      assignedWeight: 57,
      weightAllowanceSymbol: null,
      trainerName: null,
      interval: 4,
      zi: 101,
      rawOdds: 2.5,
      oddsObservedAt: null,
      ignoredPostRaceFields: ["結"],
    });
    expect(second.sex).toBe("female");
    expect(second.weightAllowanceSymbol).toBe("△");
    expect(third.sex).toBe("gelding");

    expect(first.rawFields).toEqual({
      B: null,
      直前: "11",
      芝短: "12",
      芝中: "13",
      ダ短: "14",
      ダ中: "15",
      脚: "先",
    });
    expect(second.rawFields.B).toBe("B");
    expect(first.rawFields).not.toHaveProperty("結");
    expect(first).not.toHaveProperty("finishPosition");
    expect(first).not.toHaveProperty("result");
  });

  it("parses multiple synthetic turf and dirt races including a two-digit horse number", async () => {
    const parsed = await parseFixture(
      "multi-race.synthetic.txt",
      "2027-01-11T08:00:00+09:00",
    );

    expect(parsed.races).toHaveLength(2);
    expect(parsed.races.map((race) => race.raceNumber)).toEqual([1, 2]);
    expect(parsed.races.map((race) => race.scheduledStartAt)).toEqual([
      "2027-01-11T09:50:00+09:00",
      "2027-01-11T10:20:00+09:00",
    ]);
    expect(parsed.races.map((race) => race.surface)).toEqual(["turf", "dirt"]);
    expect(parsed.races.map((race) => race.distanceMeters)).toEqual([1400, 1800]);
    expect(parsed.races.map((race) => race.declaredEntries)).toEqual([2, 3]);
    expect(parsed.races.map((race) => race.entries.length)).toEqual([2, 3]);

    const twoDigitEntry = parsed.races[1].entries.at(-1);
    expect(twoDigitEntry).toMatchObject({
      frameNumber: 5,
      horseNumber: 10,
      sex: "gelding",
      assignedWeight: 56,
      weightAllowanceSymbol: "☆",
      oddsObservedAt: null,
      ignoredPostRaceFields: ["結"],
    });
    expect(twoDigitEntry?.rawFields).toEqual({
      B: null,
      直前: "B0",
      芝短: "T9",
      芝中: "T0",
      ダ短: "D9",
      ダ中: "D0",
      脚: "追",
    });
  });

  it("parses fixed-width rows while preserving empty TARGET columns", async () => {
    const parsed = await parseFixture(
      "fixed-width-empty-columns.synthetic.txt",
      "2027-01-12T08:00:00+09:00",
    );

    expect(parsed.races).toHaveLength(1);
    expect(parsed.races[0]).toMatchObject({
      raceNumber: 1,
      surface: "dirt",
      distanceMeters: 1200,
      declaredEntries: 3,
    });
    expect(parsed.races[0].entries).toHaveLength(3);

    const [first, second, third] = parsed.races[0].entries;
    expect(first).toMatchObject({
      horseNumber: 1,
      horseName: "空欄試験一号",
      sex: "male",
      age: 3,
      jockeyName: "試験甲",
      assignedWeight: 57,
      interval: null,
      zi: 101,
      rawOdds: 2.5,
      ignoredPostRaceFields: ["結"],
    });
    expect(first.rawFields).toEqual({
      B: null,
      直前: null,
      芝短: "12",
      芝中: null,
      ダ短: "14",
      ダ中: null,
      脚: "先",
    });
    expect(second).toMatchObject({
      horseNumber: 2,
      sex: "female",
      age: 4,
      jockeyName: "架乙",
      weightAllowanceSymbol: "▲",
      interval: 8,
      zi: null,
      rawOdds: null,
      ignoredPostRaceFields: ["結"],
    });
    expect(third).toMatchObject({
      frameNumber: 6,
      horseNumber: 12,
      sex: "gelding",
      age: 5,
      jockeyName: "試験丙",
      weightAllowanceSymbol: "△",
      interval: null,
      zi: null,
      rawOdds: null,
      oddsObservedAt: null,
      trainerName: null,
      ignoredPostRaceFields: [],
    });
    expect(third.rawFields).toEqual({
      B: null,
      直前: null,
      芝短: null,
      芝中: null,
      ダ短: null,
      ダ中: null,
      脚: null,
    });
    expect(first).not.toHaveProperty("結");
    expect(first.rawFields).not.toHaveProperty("結");
  });

  it("separates an uninterpreted asterisk from one- and two-digit horse numbers", async () => {
    const parsed = await parseFixture(
      "horse-number-markers.synthetic.txt",
      "2027-01-13T08:00:00+09:00",
    );
    const entries = parsed.races[0].entries;

    expect(entries.map((entry) => entry.horseNumber)).toEqual([2, 2, 13, 13, 3, 14]);
    expect(entries.map((entry) => entry.rawHorseNumberMarker)).toEqual([
      null,
      "*",
      null,
      "*",
      "$",
      "$",
    ]);
    expect(entries[0]).toMatchObject({ interval: 4, rawIntervalMarker: null, zi: 90, rawZiMarker: "(" });
    expect(entries[1]).toMatchObject({
      rawSexAgeMarker: "*",
      interval: null,
      rawIntervalMarker: "連",
      zi: 91,
      rawZiMarker: ">(",
      weightAllowanceSymbol: "▲",
    });
    expect(entries[2]).toMatchObject({
      interval: null,
      rawIntervalMarker: null,
      zi: 92,
      rawZiMarker: "+(",
    });
    expect(entries[2].rawFields.B).toBe("B");
    expect(entries[4]).toMatchObject({
      interval: null,
      rawIntervalMarker: null,
      zi: null,
      rawZiMarker: null,
      rawOdds: null,
      ignoredPostRaceFields: [],
    });
  });

  it("parses one- and two-digit ages without shifting fixed-width jockey and numeric fields", async () => {
    const parsed = await parseFixture("two-digit-age.synthetic.txt", observedAt);
    const entries = parsed.races[0].entries;

    expect(entries).toHaveLength(6);
    expect(entries.map(({ sex, age, rawSexAgeMarker }) => ({ sex, age, rawSexAgeMarker })))
      .toEqual([
        { sex: "male", age: 3, rawSexAgeMarker: null },
        { sex: "male", age: 3, rawSexAgeMarker: "*" },
        { sex: "male", age: 10, rawSexAgeMarker: null },
        { sex: "male", age: 10, rawSexAgeMarker: "*" },
        { sex: "female", age: 10, rawSexAgeMarker: "*" },
        { sex: "gelding", age: 10, rawSexAgeMarker: "*" },
      ]);
    expect(entries[3]).toMatchObject({
      horseNumber: 13,
      jockeyName: "架空丁",
      assignedWeight: 58,
      interval: 7,
      zi: 93,
    });
    expect(entries[4]).toMatchObject({
      jockeyName: "架空戊",
      assignedWeight: 56,
      weightAllowanceSymbol: "△",
    });
    expect(entries[5]).toMatchObject({
      jockeyName: "架空己",
      assignedWeight: 59,
      interval: 9,
      zi: 95,
    });
  });

  it("rejects unsupported sex and marker in a fixed-width age field", async () => {
    const fixture = await readFile(fixturePath("two-digit-age.synthetic.txt"), "utf8");
    expect(() => parseTargetEntriesText(fixture.replace("牡10*架空丁", "牛10*架空丁"), { observedAt }))
      .toThrow("unsupported sex/age and jockey region");
    expect(() => parseTargetEntriesText(fixture.replace("牡10*架空丁", "牡10?架空丁"), { observedAt }))
      .toThrow("unsupported sex/age and jockey region");
  });

  it("requires observedAt to be supplied with an explicit timezone", async () => {
    const bytes = await readFile(fixturePath("single-race.synthetic.txt"));
    expect(() => parseTargetEntriesBytes(bytes, { observedAt: "2027-01-10T08:30:00" }))
      .toThrow("observedAt must be an externally supplied ISO 8601 datetime with timezone.");
  });
});

async function parseFixture(fileName: string, timestamp: string) {
  return parseTargetEntriesBytes(await readFile(fixturePath(fileName)), {
    observedAt: timestamp,
  });
}

function fixturePath(fileName: string) {
  return path.join(process.cwd(), "src/target-entries/fixtures", fileName);
}
