import { describe, expect, it } from "vitest";

import { calculateRuleBasedPredictionScore } from "./scoring";
import {
  availableRuleBasedModelVersions,
  defaultRuleBasedScoringConfig,
  getRuleBasedScoringConfig,
  ruleBasedScoringConfigSchema,
} from "./scoring-config";
import type { PredictionFeatureValue } from "./scoring";

describe("prediction scoring", () => {
  it("calculates a bounded rule-based prediction score", () => {
    const result = calculateRuleBasedPredictionScore(
      new Map<string, PredictionFeatureValue>([
        ["horse.has_past_race", true],
        ["horse.is_after_layoff_8w", false],
        ["horse.days_since_last_race", 21],
        ["horse.surface_top3_rate", 0.6],
        ["horse.distance_top3_rate", 0.5],
        ["horse.course_top3_rate", 0.5],
        ["jockey.venue_top3_rate", 0.5],
        ["jockey.distance_win_rate", 0.25],
      ]),
    );

    expect(result.score).toBe(59.57);
    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.length).toBeGreaterThan(0);
  });

  it("handles missing features without treating the score as probability", () => {
    const result = calculateRuleBasedPredictionScore(new Map());

    expect(result.score).toBe(50);
    expect(result.components).toEqual([]);
  });

  it("validates rule-based-v1 scoring config", () => {
    const result = ruleBasedScoringConfigSchema.safeParse(
      defaultRuleBasedScoringConfig,
    );

    expect(result.success).toBe(true);
    expect(defaultRuleBasedScoringConfig.modelVersion).toBe("rule-based-v1");
  });

  it("loads rule-based-v1.1 as a separate model version", () => {
    const config = getRuleBasedScoringConfig("rule-based-v1.1");
    const result = ruleBasedScoringConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    expect(config.modelVersion).toBe("rule-based-v1.1");
    expect(availableRuleBasedModelVersions).toEqual([
      "rule-based-v1",
      "rule-based-v1.1",
    ]);
  });

  it("keeps rule-based-v1 compatible with the previous hard-coded score", () => {
    const result = calculateRuleBasedPredictionScore(
      new Map<string, PredictionFeatureValue>([
        ["horse.has_past_race", true],
        ["horse.is_after_layoff_8w", false],
        ["horse.days_since_last_race", 21],
        ["horse.surface_top3_rate", 0.6],
        ["horse.distance_top3_rate", 0.5],
        ["horse.track_condition_top3_rate", 0.4],
        ["horse.course_top3_rate", 0.5],
        ["horse.best_time_same_surface_distance_ms", 94000],
        ["horse.best_time_same_surface_distance_count", 2],
        ["jockey.venue_win_rate", 0.2],
        ["jockey.venue_top3_rate", 0.5],
        ["jockey.distance_win_rate", 0.25],
        ["jockey.distance_top3_rate", 0.45],
      ]),
      defaultRuleBasedScoringConfig,
    );

    expect(result.score).toBe(61);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "horse.best_time_same_surface_distance_ms",
          adjustment: 1,
        }),
        expect.objectContaining({
          key: "jockey.venue_win_rate",
          adjustment: -0.52,
        }),
      ]),
    );
  });

  it("keeps rule-based-v1 intact while rule-based-v1.1 uses gentler weights", () => {
    const features = new Map<string, PredictionFeatureValue>([
      ["horse.has_past_race", true],
      ["horse.is_after_layoff_8w", false],
      ["horse.days_since_last_race", 21],
      ["horse.surface_top3_rate", 0.6],
      ["horse.distance_top3_rate", 0.5],
      ["horse.track_condition_top3_rate", 0.4],
      ["horse.course_top3_rate", 0.5],
      ["horse.best_time_same_surface_distance_ms", 94000],
      ["horse.best_time_same_surface_distance_count", 2],
      ["jockey.venue_win_rate", 0.2],
      ["jockey.venue_top3_rate", 0.5],
      ["jockey.distance_win_rate", 0.25],
      ["jockey.distance_top3_rate", 0.45],
    ]);

    const v1 = calculateRuleBasedPredictionScore(
      features,
      getRuleBasedScoringConfig("rule-based-v1"),
    );
    const v11 = calculateRuleBasedPredictionScore(
      features,
      getRuleBasedScoringConfig("rule-based-v1.1"),
    );

    expect(v1.score).toBe(61);
    expect(v11.score).toBe(58.55);
    expect(v11.score).toBeLessThan(v1.score);
  });
});
