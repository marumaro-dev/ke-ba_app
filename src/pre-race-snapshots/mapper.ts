import type {
  ParsedTargetEntries,
  ParsedTargetEntry,
  ParsedTargetRace,
} from "../target-entries/parser";

import { preRaceSnapshotSchema } from "./schema";
import type { Observation, PreRaceSnapshotDto } from "./types";

export type TargetEntrySnapshotInput = Omit<
  ParsedTargetEntry,
  "rawHorseNumberMarker" | "trainerName"
> & {
  rawHorseNumberMarker: string | null;
  trainerName: string | null;
};

export type TargetRaceSnapshotInput = Omit<ParsedTargetRace, "entries"> & {
  entries: readonly TargetEntrySnapshotInput[];
};

export type TargetEntriesSnapshotInput = Omit<ParsedTargetEntries, "races"> & {
  races: readonly TargetRaceSnapshotInput[];
};

export type MapTargetEntriesOptions = {
  observation: Observation;
  source: {
    fileName: string | null;
    checksum: string | null;
  };
};

const prohibitedPostRaceKeys = new Set([
  "結",
  "finishPosition",
  "finish_position",
  "finishStatus",
  "finish_status",
  "finishTime",
  "finish_time",
  "上り",
  "着差",
  "払戻",
  "確定人気",
]);

export function mapTargetEntriesToPreRaceSnapshots(
  input: TargetEntriesSnapshotInput,
  options: MapTargetEntriesOptions,
): PreRaceSnapshotDto[] {
  assertNoPostRaceValues(input);

  return input.races.map((race) => {
    const snapshot: PreRaceSnapshotDto = {
      schemaVersion: "pre-race-snapshot-v1",
      providerCode: "jra_van",
      observation: { ...options.observation },
      source: { ...options.source },
      race: {
        raceDate: race.raceDate,
        venue: race.venue,
        raceNumber: race.raceNumber,
        scheduledStartAt: race.scheduledStartAt,
        surface: race.surface,
        distanceMeters: race.distanceMeters,
        declaredEntries: race.declaredEntries,
      },
      entries: race.entries.map((entry) => ({
        frameNumber: entry.frameNumber,
        horseNumber: entry.horseNumber,
        horse: unresolvedEntity(entry.horseName),
        jockey: unresolvedEntity(entry.jockeyName),
        trainer: entry.trainerName === null ? null : unresolvedEntity(entry.trainerName),
        sex: entry.sex,
        age: entry.age,
        assignedWeight: entry.assignedWeight,
        interval: entry.interval,
        zi: entry.zi,
        raw: {
          horseNumberMarker: entry.rawHorseNumberMarker,
          sexAgeMarker: entry.rawSexAgeMarker,
          weightAllowanceMarker: entry.weightAllowanceSymbol,
          intervalMarker: entry.rawIntervalMarker,
          ziMarker: entry.rawZiMarker,
          targetFields: { ...entry.rawFields },
          odds: {
            value: entry.rawOdds,
            observedAt: null,
            featureEligible: false,
            reason: "observation_time_unknown",
          },
        },
      })),
    };

    return preRaceSnapshotSchema.parse(snapshot);
  });
}

function unresolvedEntity(displayName: string) {
  return {
    internalId: null,
    providerEntityId: null,
    displayName,
  };
}

function assertNoPostRaceValues(value: unknown, path = "input"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPostRaceValues(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (prohibitedPostRaceKeys.has(key)) {
      throw new Error(`Post-race field is prohibited in pre-race input: ${path}.${key}`);
    }
    assertNoPostRaceValues(child, `${path}.${key}`);
  }
}
