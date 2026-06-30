import { describe, expect, it } from "vitest";

import {
  calculateP0Features,
  calculatePhase2Features,
  normalizeSurface,
} from "./calculator";
import type {
  JockeyPastPerformance,
  PastPerformance,
  TargetRaceEntry,
} from "./calculator";

const target: TargetRaceEntry = {
  raceEntryId: "entry-target",
  raceId: "race-target",
  horseId: "horse-1",
  jockeyId: "jockey-1",
  raceDate: "2026-07-04",
  scheduledStartAt: new Date("2026-07-04T15:40:00+09:00"),
  venue: "東京",
  surface: "芝",
  distanceMeters: 1600,
  trackCondition: "良",
};

describe("feature calculator", () => {
  it("calculates P0 horse features from eligible past performances", () => {
    const past: PastPerformance[] = [
      pastPerformance({
        raceDate: "2026-06-01",
        venue: "東京",
        surface: "芝",
        distanceMeters: 1600,
        finishPosition: 2,
      }),
      pastPerformance({
        raceDate: "2026-05-01",
        venue: "京都",
        surface: "ダート",
        distanceMeters: 1800,
        finishPosition: 5,
      }),
    ];

    const features = calculateP0Features(
      target,
      past,
      new Date("2026-07-04T10:00:00+09:00"),
    );

    expect(featureValue(features, "horse.days_since_last_race")).toBe(33);
    expect(featureValue(features, "horse.has_past_race")).toBe(true);
    expect(featureValue(features, "horse.is_after_layoff_8w")).toBe(false);
    expect(featureValue(features, "horse.surface_starts")).toBe(1);
    expect(featureValue(features, "horse.surface_top3_rate")).toBe(1);
    expect(featureValue(features, "horse.distance_starts")).toBe(1);
    expect(featureValue(features, "horse.distance_top3_rate")).toBe(1);
  });

  it("calculates P1 best time, track condition, and course features", () => {
    const past: PastPerformance[] = [
      pastPerformance({
        raceDate: "2026-06-01",
        venue: "東京",
        surface: "芝",
        distanceMeters: 1600,
        trackCondition: "良",
        finishPosition: 2,
        finishTimeMilliseconds: 93_400,
      }),
      pastPerformance({
        raceDate: "2026-05-10",
        venue: "東京",
        surface: "芝",
        distanceMeters: 1600,
        trackCondition: "良",
        finishPosition: 4,
        finishTimeMilliseconds: 92_800,
      }),
      pastPerformance({
        raceDate: "2026-04-20",
        venue: "中山",
        surface: "芝",
        distanceMeters: 1600,
        trackCondition: "重",
        finishPosition: 1,
        finishTimeMilliseconds: 94_000,
      }),
      pastPerformance({
        raceDate: "2026-04-01",
        venue: "東京",
        surface: "芝",
        distanceMeters: 1600,
        trackCondition: "良",
        finishPosition: null,
        finishStatus: "did_not_finish",
        finishTimeMilliseconds: null,
      }),
    ];

    const features = calculatePhase2Features(
      target,
      past,
      new Date("2026-07-04T10:00:00+09:00"),
    );

    expect(
      featureValue(features, "horse.best_time_same_surface_distance_ms"),
    ).toBe(92_800);
    expect(
      featureValue(features, "horse.best_time_same_surface_distance_count"),
    ).toBe(3);
    expect(featureValue(features, "horse.track_condition_starts")).toBe(3);
    expect(featureValue(features, "horse.track_condition_top3_rate")).toBe(
      1 / 3,
    );
    expect(featureValue(features, "horse.course_starts")).toBe(3);
    expect(featureValue(features, "horse.course_top3_rate")).toBe(1 / 3);
  });

  it("calculates P2 jockey venue and distance features", () => {
    const jockeyPast: JockeyPastPerformance[] = [
      pastPerformance({
        raceDate: "2026-06-01",
        venue: "東京",
        distanceMeters: 1600,
        finishPosition: 1,
      }),
      pastPerformance({
        raceDate: "2026-05-10",
        venue: "東京",
        distanceMeters: 1800,
        finishPosition: 3,
      }),
      pastPerformance({
        raceDate: "2026-04-20",
        venue: "中山",
        distanceMeters: 1600,
        finishPosition: 4,
      }),
      pastPerformance({
        raceDate: "2026-03-20",
        venue: "東京",
        distanceMeters: 1600,
        finishPosition: 8,
      }),
    ];

    const features = calculatePhase2Features(
      target,
      [],
      new Date("2026-07-04T10:00:00+09:00"),
      jockeyPast,
    );

    expect(featureValue(features, "jockey.venue_starts")).toBe(3);
    expect(featureValue(features, "jockey.venue_wins")).toBe(1);
    expect(featureValue(features, "jockey.venue_top3")).toBe(2);
    expect(featureValue(features, "jockey.venue_win_rate")).toBe(1 / 3);
    expect(featureValue(features, "jockey.venue_top3_rate")).toBe(2 / 3);
    expect(featureValue(features, "jockey.distance_starts")).toBe(3);
    expect(featureValue(features, "jockey.distance_wins")).toBe(1);
    expect(featureValue(features, "jockey.distance_top3")).toBe(1);
    expect(featureValue(features, "jockey.distance_win_rate")).toBe(1 / 3);
    expect(featureValue(features, "jockey.distance_top3_rate")).toBe(1 / 3);
  });

  it("does not use target race results or unavailable future results", () => {
    const past: PastPerformance[] = [
      pastPerformance({
        raceDate: "2026-07-04",
        scheduledStartAt: new Date("2026-07-04T15:40:00+09:00"),
        venue: "東京",
        finishPosition: 1,
        finishTimeMilliseconds: 91_000,
      }),
      pastPerformance({
        raceDate: "2026-06-20",
        venue: "東京",
        finishPosition: 1,
        finishTimeMilliseconds: 92_000,
        resultAvailableAt: new Date("2026-07-05T15:05:00+09:00"),
      }),
    ];
    const jockeyPast: JockeyPastPerformance[] = [
      pastPerformance({
        raceDate: "2026-07-04",
        scheduledStartAt: new Date("2026-07-04T15:40:00+09:00"),
        venue: "東京",
        distanceMeters: 1600,
        finishPosition: 1,
      }),
      pastPerformance({
        raceDate: "2026-06-20",
        venue: "東京",
        distanceMeters: 1600,
        finishPosition: 1,
        resultAvailableAt: new Date("2026-07-05T15:05:00+09:00"),
      }),
    ];

    const features = calculatePhase2Features(
      target,
      past,
      new Date("2026-07-04T10:00:00+09:00"),
      jockeyPast,
    );

    expect(featureValue(features, "horse.has_past_race")).toBe(false);
    expect(featureValue(features, "horse.days_since_last_race")).toBeNull();
    expect(featureValue(features, "horse.surface_starts")).toBe(0);
    expect(
      featureValue(features, "horse.best_time_same_surface_distance_ms"),
    ).toBeNull();
    expect(featureValue(features, "horse.course_starts")).toBe(0);
    expect(featureValue(features, "jockey.venue_starts")).toBe(0);
    expect(featureValue(features, "jockey.venue_win_rate")).toBeNull();
    expect(featureValue(features, "jockey.distance_starts")).toBe(0);
  });

  it("normalizes surface values", () => {
    expect(normalizeSurface("芝")).toBe("turf");
    expect(normalizeSurface("ダート")).toBe("dirt");
    expect(normalizeSurface("障害")).toBe("other");
  });
});

function pastPerformance(
  overrides: Partial<PastPerformance> & { raceDate: string },
): PastPerformance {
  return {
    raceDate: overrides.raceDate,
    scheduledStartAt:
      overrides.scheduledStartAt ??
      new Date(`${overrides.raceDate}T15:00:00+09:00`),
    venue: overrides.venue ?? "東京",
    surface: overrides.surface ?? "芝",
    distanceMeters: overrides.distanceMeters ?? 1600,
    trackCondition: overrides.trackCondition ?? "良",
    finishPosition: overrides.finishPosition ?? null,
    finishStatus: overrides.finishStatus ?? "finished",
    finishTimeMilliseconds: overrides.finishTimeMilliseconds ?? 93_400,
    resultAvailableAt:
      overrides.resultAvailableAt ??
      new Date(`${overrides.raceDate}T15:05:00+09:00`),
    resultObservedAt:
      overrides.resultObservedAt ??
      new Date(`${overrides.raceDate}T15:06:00+09:00`),
  };
}

function featureValue(
  features: ReturnType<typeof calculatePhase2Features>,
  featureKey: string,
) {
  const feature = features.find((item) => item.featureKey === featureKey);
  return feature?.valueType === "boolean"
    ? feature.booleanValue
    : feature?.numberValue;
}
