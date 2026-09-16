import { describe, expect, it } from "vitest";

import { createPreRaceSnapshotFingerprint } from "./fingerprint";
import type { Observation, PreRaceEntryDto, PreRaceSnapshotDto } from "./types";

const sourceRaceKey = "jra_van_20270201_fictional_1";

describe("createPreRaceSnapshotFingerprint", () => {
  it("returns the same lowercase SHA-256 hex for the same synthetic snapshot", () => {
    const dto = makeDto();
    const first = createPreRaceSnapshotFingerprint(dto, sourceRaceKey);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(createPreRaceSnapshotFingerprint(dto, sourceRaceKey)).toBe(first);
  });

  it("distinguishes known observation times", () => {
    const earlier = makeDto({
      timeStatus: "known",
      observedAt: "2027-02-01T09:00:00+09:00",
    });
    const later = makeDto({
      timeStatus: "known",
      observedAt: "2027-02-01T09:01:00+09:00",
    });

    expect(createPreRaceSnapshotFingerprint(earlier, sourceRaceKey)).not.toBe(
      createPreRaceSnapshotFingerprint(later, sourceRaceKey),
    );
  });

  it("deduplicates an unknown observation with identical content", () => {
    const first = makeDto();
    const second = structuredClone(first);

    expect(first.observation).toEqual({
      timeStatus: "unknown",
      observedAt: null,
    });
    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("ignores input entry order and nested object insertion order", () => {
    const first = makeDto();
    const second = structuredClone(first);
    second.entries.reverse();
    second.entries[0].raw.targetFields = {
      脚: null,
      ダ中: null,
      ダ短: null,
      芝中: "8",
      芝短: null,
      直前: null,
      B: null,
    };
    first.entries[1].raw.targetFields.芝中 = "8";

    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("ignores internal and provider entity IDs", () => {
    const first = makeDto();
    const second = structuredClone(first);
    second.entries[0].horse.internalId = "synthetic-internal-horse";
    second.entries[0].horse.providerEntityId = "synthetic-provider-horse";
    second.entries[0].jockey.internalId = "synthetic-internal-jockey";
    second.entries[0].trainer!.providerEntityId = "synthetic-provider-trainer";

    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("changes when a raw marker changes", () => {
    const first = makeDto();
    const second = structuredClone(first);
    second.entries[0].raw.horseNumberMarker = "$";

    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).not.toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("changes when raw odds change", () => {
    const first = makeDto();
    const second = structuredClone(first);
    second.entries[0].raw.odds.value = 4.5;

    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).not.toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("ignores source file name and checksum", () => {
    const first = makeDto();
    const second = structuredClone(first);
    second.source = {
      fileName: "another-synthetic-file.txt",
      checksum: "synthetic-checksum",
    };

    expect(createPreRaceSnapshotFingerprint(first, sourceRaceKey)).toBe(
      createPreRaceSnapshotFingerprint(second, sourceRaceKey),
    );
  });

  it("includes sourceRaceKey and rejects duplicate horse numbers", () => {
    const dto = makeDto();
    expect(createPreRaceSnapshotFingerprint(dto, sourceRaceKey)).not.toBe(
      createPreRaceSnapshotFingerprint(dto, `${sourceRaceKey}_other`),
    );
    dto.entries[1].horseNumber = dto.entries[0].horseNumber;
    expect(() => createPreRaceSnapshotFingerprint(dto, sourceRaceKey)).toThrow(
      "Duplicate horseNumber",
    );
  });
});

function makeDto(
  observation: Observation = { timeStatus: "unknown", observedAt: null },
): PreRaceSnapshotDto {
  return {
    schemaVersion: "pre-race-snapshot-v1",
    providerCode: "jra_van",
    observation,
    source: { fileName: "synthetic-file.txt", checksum: null },
    race: {
      raceDate: "2027-02-01",
      venue: "架空競馬場",
      raceNumber: 1,
      scheduledStartAt: "2027-02-01T10:00:00+09:00",
      surface: "turf",
      distanceMeters: 1600,
      declaredEntries: 2,
    },
    entries: [makeEntry(2), makeEntry(1)],
  };
}

function makeEntry(horseNumber: number): PreRaceEntryDto {
  return {
    frameNumber: horseNumber,
    horseNumber,
    horse: {
      internalId: null,
      providerEntityId: null,
      displayName: `架空馬${horseNumber}`,
    },
    jockey: {
      internalId: null,
      providerEntityId: null,
      displayName: `架空騎手${horseNumber}`,
    },
    trainer: {
      internalId: null,
      providerEntityId: null,
      displayName: "架空調教師",
    },
    sex: "male",
    age: 3,
    assignedWeight: 57,
    interval: null,
    zi: 100,
    raw: {
      horseNumberMarker: "*",
      sexAgeMarker: null,
      weightAllowanceMarker: null,
      intervalMarker: "連",
      ziMarker: "(",
      targetFields: {
        B: null,
        直前: null,
        芝短: null,
        芝中: null,
        ダ短: null,
        ダ中: null,
        脚: null,
      },
      odds: {
        value: 2.5,
        observedAt: null,
        featureEligible: false,
        reason: "observation_time_unknown",
      },
    },
  };
}
