export type TargetRaceEntry = {
  raceEntryId: string;
  raceId: string;
  horseId: string;
  jockeyId: string | null;
  raceDate: string;
  scheduledStartAt: Date;
  venue: string;
  surface: string;
  distanceMeters: number;
  trackCondition: string | null;
};

export type PastPerformance = {
  raceDate: string;
  scheduledStartAt: Date;
  venue: string;
  surface: string;
  distanceMeters: number;
  trackCondition: string | null;
  finishPosition: number | null;
  finishStatus: string;
  finishTimeMilliseconds: number | null;
  resultAvailableAt: Date;
  resultObservedAt: Date;
};

export type JockeyPastPerformance = PastPerformance;

export type CalculatedFeature = {
  featureKey: string;
  valueType: "number" | "boolean";
  numberValue?: number | null;
  booleanValue?: boolean | null;
  sourceAvailableUntil: Date | null;
  sourceObservedUntil: Date | null;
};

export function calculatePhase2Features(
  target: TargetRaceEntry,
  pastPerformances: PastPerformance[],
  asOfAt: Date,
  jockeyPastPerformances: JockeyPastPerformance[] = [],
): CalculatedFeature[] {
  const eligiblePast = getEligiblePastPerformances(
    target,
    pastPerformances,
    asOfAt,
  );
  const lastRace = eligiblePast[0];
  const daysSinceLastRace = lastRace
    ? differenceInCalendarDays(target.raceDate, lastRace.raceDate)
    : null;
  const targetSurface = normalizeSurface(target.surface);
  const surfacePast = eligiblePast.filter(
    (past) => normalizeSurface(past.surface) === targetSurface,
  );
  const distancePast = eligiblePast.filter(
    (past) => past.distanceMeters === target.distanceMeters,
  );
  const timedSameSurfaceDistancePast = eligiblePast.filter(
    (past) =>
      normalizeSurface(past.surface) === targetSurface &&
      past.distanceMeters === target.distanceMeters &&
      past.finishStatus === "finished" &&
      past.finishTimeMilliseconds !== null,
  );
  const trackConditionPast = target.trackCondition
    ? eligiblePast.filter(
        (past) => past.trackCondition === target.trackCondition,
      )
    : [];
  const coursePast = eligiblePast.filter(
    (past) =>
      past.venue === target.venue &&
      normalizeSurface(past.surface) === targetSurface &&
      past.distanceMeters === target.distanceMeters,
  );
  const eligibleJockeyPast = target.jockeyId
    ? getEligiblePastPerformances(target, jockeyPastPerformances, asOfAt)
    : [];
  const jockeyVenuePast = eligibleJockeyPast.filter(
    (past) => past.venue === target.venue,
  );
  const jockeyDistancePast = eligibleJockeyPast.filter(
    (past) => past.distanceMeters === target.distanceMeters,
  );
  const sourceAvailableUntil = maxDate(
    eligiblePast.map((past) => past.resultAvailableAt),
  );
  const sourceObservedUntil = maxDate(
    eligiblePast.map((past) => past.resultObservedAt),
  );
  const jockeyVenueSourceAvailableUntil = maxDate(
    jockeyVenuePast.map((past) => past.resultAvailableAt),
  );
  const jockeyVenueSourceObservedUntil = maxDate(
    jockeyVenuePast.map((past) => past.resultObservedAt),
  );
  const jockeyDistanceSourceAvailableUntil = maxDate(
    jockeyDistancePast.map((past) => past.resultAvailableAt),
  );
  const jockeyDistanceSourceObservedUntil = maxDate(
    jockeyDistancePast.map((past) => past.resultObservedAt),
  );

  return [
    {
      featureKey: "horse.days_since_last_race",
      valueType: "number",
      numberValue: daysSinceLastRace,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.has_past_race",
      valueType: "boolean",
      booleanValue: eligiblePast.length > 0,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.is_after_layoff_8w",
      valueType: "boolean",
      booleanValue:
        daysSinceLastRace === null ? null : daysSinceLastRace >= 56,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.surface_starts",
      valueType: "number",
      numberValue: surfacePast.length,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.surface_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(surfacePast),
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.distance_starts",
      valueType: "number",
      numberValue: distancePast.length,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.distance_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(distancePast),
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.best_time_same_surface_distance_ms",
      valueType: "number",
      numberValue: minFinishTime(timedSameSurfaceDistancePast),
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.best_time_same_surface_distance_count",
      valueType: "number",
      numberValue: timedSameSurfaceDistancePast.length,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.track_condition_starts",
      valueType: "number",
      numberValue: trackConditionPast.length,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.track_condition_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(trackConditionPast),
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.course_starts",
      valueType: "number",
      numberValue: coursePast.length,
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "horse.course_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(coursePast),
      sourceAvailableUntil,
      sourceObservedUntil,
    },
    {
      featureKey: "jockey.venue_starts",
      valueType: "number",
      numberValue: jockeyVenuePast.length,
      sourceAvailableUntil: jockeyVenueSourceAvailableUntil,
      sourceObservedUntil: jockeyVenueSourceObservedUntil,
    },
    {
      featureKey: "jockey.venue_wins",
      valueType: "number",
      numberValue: calculateWinCount(jockeyVenuePast),
      sourceAvailableUntil: jockeyVenueSourceAvailableUntil,
      sourceObservedUntil: jockeyVenueSourceObservedUntil,
    },
    {
      featureKey: "jockey.venue_top3",
      valueType: "number",
      numberValue: calculateTop3Count(jockeyVenuePast),
      sourceAvailableUntil: jockeyVenueSourceAvailableUntil,
      sourceObservedUntil: jockeyVenueSourceObservedUntil,
    },
    {
      featureKey: "jockey.venue_win_rate",
      valueType: "number",
      numberValue: calculateWinRate(jockeyVenuePast),
      sourceAvailableUntil: jockeyVenueSourceAvailableUntil,
      sourceObservedUntil: jockeyVenueSourceObservedUntil,
    },
    {
      featureKey: "jockey.venue_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(jockeyVenuePast),
      sourceAvailableUntil: jockeyVenueSourceAvailableUntil,
      sourceObservedUntil: jockeyVenueSourceObservedUntil,
    },
    {
      featureKey: "jockey.distance_starts",
      valueType: "number",
      numberValue: jockeyDistancePast.length,
      sourceAvailableUntil: jockeyDistanceSourceAvailableUntil,
      sourceObservedUntil: jockeyDistanceSourceObservedUntil,
    },
    {
      featureKey: "jockey.distance_wins",
      valueType: "number",
      numberValue: calculateWinCount(jockeyDistancePast),
      sourceAvailableUntil: jockeyDistanceSourceAvailableUntil,
      sourceObservedUntil: jockeyDistanceSourceObservedUntil,
    },
    {
      featureKey: "jockey.distance_top3",
      valueType: "number",
      numberValue: calculateTop3Count(jockeyDistancePast),
      sourceAvailableUntil: jockeyDistanceSourceAvailableUntil,
      sourceObservedUntil: jockeyDistanceSourceObservedUntil,
    },
    {
      featureKey: "jockey.distance_win_rate",
      valueType: "number",
      numberValue: calculateWinRate(jockeyDistancePast),
      sourceAvailableUntil: jockeyDistanceSourceAvailableUntil,
      sourceObservedUntil: jockeyDistanceSourceObservedUntil,
    },
    {
      featureKey: "jockey.distance_top3_rate",
      valueType: "number",
      numberValue: calculateTop3Rate(jockeyDistancePast),
      sourceAvailableUntil: jockeyDistanceSourceAvailableUntil,
      sourceObservedUntil: jockeyDistanceSourceObservedUntil,
    },
  ];
}

export function calculateP0Features(
  target: TargetRaceEntry,
  pastPerformances: PastPerformance[],
  asOfAt: Date,
) {
  return calculatePhase2Features(target, pastPerformances, asOfAt).filter(
    (feature) =>
      [
        "horse.days_since_last_race",
        "horse.has_past_race",
        "horse.is_after_layoff_8w",
        "horse.surface_starts",
        "horse.surface_top3_rate",
        "horse.distance_starts",
        "horse.distance_top3_rate",
      ].includes(feature.featureKey),
  );
}

export function getEligiblePastPerformances(
  target: TargetRaceEntry,
  pastPerformances: PastPerformance[],
  asOfAt: Date,
) {
  return pastPerformances
    .filter(
      (past) =>
        past.scheduledStartAt < target.scheduledStartAt &&
        past.resultAvailableAt <= asOfAt,
    )
    .sort(
      (a, b) => b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime(),
    );
}

export function normalizeSurface(surface: string) {
  if (surface.includes("芝") || surface.includes("闃")) {
    return "turf";
  }
  if (surface.includes("ダート") || surface.includes("繝繝ｼ繝")) {
    return "dirt";
  }
  return "other";
}

function calculateTop3Rate(pastPerformances: PastPerformance[]) {
  if (pastPerformances.length === 0) {
    return null;
  }

  const top3Count = calculateTop3Count(pastPerformances);

  return top3Count / pastPerformances.length;
}

function calculateTop3Count(pastPerformances: PastPerformance[]) {
  return pastPerformances.filter(
    (past) => past.finishPosition !== null && past.finishPosition <= 3,
  ).length;
}

function calculateWinRate(pastPerformances: PastPerformance[]) {
  if (pastPerformances.length === 0) {
    return null;
  }

  return calculateWinCount(pastPerformances) / pastPerformances.length;
}

function calculateWinCount(pastPerformances: PastPerformance[]) {
  return pastPerformances.filter((past) => past.finishPosition === 1).length;
}

function minFinishTime(pastPerformances: PastPerformance[]) {
  const values = pastPerformances.flatMap((past) =>
    past.finishTimeMilliseconds === null ? [] : [past.finishTimeMilliseconds],
  );

  if (values.length === 0) {
    return null;
  }

  return Math.min(...values);
}

function differenceInCalendarDays(targetDate: string, pastDate: string) {
  const target = new Date(`${targetDate}T00:00:00+09:00`);
  const past = new Date(`${pastDate}T00:00:00+09:00`);
  return Math.round((target.getTime() - past.getTime()) / 86_400_000);
}

function maxDate(values: Date[]) {
  if (values.length === 0) {
    return null;
  }

  return new Date(Math.max(...values.map((value) => value.getTime())));
}
