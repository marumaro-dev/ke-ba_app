import { describe, expect, it } from "vitest";

import { mapTargetEntriesToPreRaceSnapshots } from "./mapper";
import type { TargetEntriesSnapshotInput, TargetEntrySnapshotInput } from "./mapper";

describe("mapTargetEntriesToPreRaceSnapshots", () => {
  it("maps multiple synthetic entries with a known pre-race observation", () => {
    const result = mapTargetEntriesToPreRaceSnapshots(makeInput(), {
      observation: { observedAt: "2027-02-01T09:00:00+09:00", timeStatus: "known" },
      source: { fileName: "synthetic-entries.txt", checksum: null },
    });

    expect(result).toHaveLength(1);
    expect(result[0].observation).toEqual({
      observedAt: "2027-02-01T09:00:00+09:00",
      timeStatus: "known",
    });
    expect(result[0].entries).toHaveLength(3);
    expect(result[0].entries.map((entry) => entry.raw.horseNumberMarker)).toEqual([
      "*",
      "$",
      "架",
    ]);
    expect(result[0].entries[0].horse).toEqual({
      internalId: null,
      providerEntityId: null,
      displayName: "架空馬一号",
    });
    expect(result[0].entries[0].jockey.internalId).toBeNull();
    expect(result[0].entries[0].trainer).toBeNull();
    expect(result[0].entries[1]).toMatchObject({
      interval: null,
      raw: { intervalMarker: "連" },
    });
    expect(result[0].entries[0].raw.odds).toEqual({
      value: 2.5,
      observedAt: null,
      featureEligible: false,
      reason: "observation_time_unknown",
    });
    expect(result[0].entries[0]).not.toHaveProperty("結");
    expect(result[0].entries[0]).not.toHaveProperty("finishPosition");
    expect(result[0].entries[0].raw).not.toHaveProperty("ignoredPostRaceFields");
  });

  it("allows an explicitly unknown observation without inventing a timestamp", () => {
    const [result] = mapTargetEntriesToPreRaceSnapshots(makeInput(), {
      observation: { observedAt: null, timeStatus: "unknown" },
      source: { fileName: null, checksum: null },
    });

    expect(result.observation).toEqual({ observedAt: null, timeStatus: "unknown" });
  });

  it("rejects a known observation at or after scheduled start", () => {
    expect(() => mapTargetEntriesToPreRaceSnapshots(makeInput(), {
      observation: { observedAt: "2027-02-01T10:00:00+09:00", timeStatus: "known" },
      source: { fileName: null, checksum: null },
    })).toThrow("known observedAt must be earlier than scheduledStartAt");
  });

  it("rejects explicit post-race values in mapper input", () => {
    const input = makeInput() as TargetEntriesSnapshotInput & {
      races: Array<TargetEntriesSnapshotInput["races"][number] & { finishPosition?: number }>;
    };
    input.races[0].finishPosition = 1;

    expect(() => mapTargetEntriesToPreRaceSnapshots(input, {
      observation: { observedAt: null, timeStatus: "unknown" },
      source: { fileName: null, checksum: null },
    })).toThrow("Post-race field is prohibited");
  });

  it("rejects more entries than the declared count", () => {
    const input = makeInput();
    input.races[0].declaredEntries = 2;

    expect(() => mapTargetEntriesToPreRaceSnapshots(input, {
      observation: { observedAt: null, timeStatus: "unknown" },
      source: { fileName: null, checksum: null },
    })).toThrow("entries.length must not exceed declaredEntries");
  });
});

function makeInput(): TargetEntriesSnapshotInput {
  return {
    observedAt: "1999-01-01T00:00:00.000Z",
    races: [{
      raceDate: "2027-02-01",
      venue: "架空競馬場",
      raceNumber: 1,
      scheduledStartAt: "2027-02-01T10:00:00+09:00",
      surface: "turf",
      distanceMeters: 1600,
      declaredEntries: 3,
      entries: [
        makeEntry({ horseNumber: 1, rawHorseNumberMarker: "*" }),
        makeEntry({
          horseNumber: 2,
          horseName: "架空馬二号",
          rawHorseNumberMarker: "$",
          interval: null,
          rawIntervalMarker: "連",
        }),
        makeEntry({
          horseNumber: 3,
          horseName: "架空馬三号",
          rawHorseNumberMarker: "架",
        }),
      ],
    }],
  };
}

function makeEntry(
  overrides: Partial<TargetEntrySnapshotInput> = {},
): TargetEntrySnapshotInput {
  return {
    frameNumber: 1,
    horseNumber: 1,
    rawHorseNumberMarker: null,
    horseName: "架空馬一号",
    sex: "male",
    age: 3,
    rawSexAgeMarker: null,
    jockeyName: "架空騎手",
    assignedWeight: 57,
    weightAllowanceSymbol: null,
    trainerName: null,
    interval: 4,
    rawIntervalMarker: null,
    zi: 100,
    rawZiMarker: "(",
    rawOdds: 2.5,
    oddsObservedAt: null,
    rawFields: {
      B: null,
      直前: "0)",
      芝短: null,
      芝中: null,
      ダ短: null,
      ダ中: null,
      脚: "1",
    },
    ignoredPostRaceFields: ["結"],
    ...overrides,
  };
}
