export type Observation =
  | {
      observedAt: string;
      timeStatus: "known";
    }
  | {
      observedAt: null;
      timeStatus: "unknown";
    };

export type EntityReference = {
  internalId: string | null;
  providerEntityId: string | null;
  displayName: string;
};

export type RawOddsAudit = {
  value: number | null;
  observedAt: null;
  featureEligible: false;
  reason: "observation_time_unknown";
};

export type PreRaceEntryRaw = {
  horseNumberMarker: string | null;
  sexAgeMarker: string | null;
  weightAllowanceMarker: string | null;
  intervalMarker: string | null;
  ziMarker: string | null;
  targetFields: {
    B: string | null;
    直前: string | null;
    芝短: string | null;
    芝中: string | null;
    ダ短: string | null;
    ダ中: string | null;
    脚: string | null;
  };
  odds: RawOddsAudit;
};

export type PreRaceEntryDto = {
  frameNumber: number;
  horseNumber: number;
  horse: EntityReference;
  jockey: EntityReference;
  trainer: EntityReference | null;
  sex: "male" | "female" | "gelding";
  age: number;
  assignedWeight: number;
  interval: number | null;
  zi: number | null;
  raw: PreRaceEntryRaw;
};

export type PreRaceSnapshotDto = {
  schemaVersion: "pre-race-snapshot-v1";
  providerCode: "jra_van";
  observation: Observation;
  source: {
    fileName: string | null;
    checksum: string | null;
  };
  race: {
    raceDate: string;
    venue: string;
    raceNumber: number;
    scheduledStartAt: string;
    surface: "turf" | "dirt";
    distanceMeters: number;
    declaredEntries: number;
  };
  entries: PreRaceEntryDto[];
};
