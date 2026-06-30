import { describe, expect, it } from "vitest";

import {
  formatFeatureCountLabel,
  formatFeatureValue,
  formatJson,
  formatPhase2FeatureValue,
  phase2FeatureGroupLabels,
  phase2FeatureLabels,
} from "./formatters";

describe("feature formatters", () => {
  it("formats feature values", () => {
    expect(formatFeatureValue(true)).toBe("はい");
    expect(formatFeatureValue(false)).toBe("いいえ");
    expect(formatFeatureValue(0.333333)).toBe("0.333");
    expect(formatFeatureValue(null)).toBe("—");
  });

  it("formats Phase2 feature values with units", () => {
    expect(formatPhase2FeatureValue("horse.days_since_last_race", 14)).toBe(
      "14日",
    );
    expect(formatPhase2FeatureValue("horse.surface_top3_rate", 0.375)).toBe(
      "37.5%",
    );
    expect(formatPhase2FeatureValue("jockey.venue_win_rate", 0.25)).toBe(
      "25.0%",
    );
    expect(
      formatPhase2FeatureValue(
        "horse.best_time_same_surface_distance_ms",
        93_400,
      ),
    ).toBe("1:33.4");
    expect(formatPhase2FeatureValue("horse.has_past_race", true)).toBe("はい");
  });

  it("formats list count labels", () => {
    expect(formatFeatureCountLabel(0, 20)).toBe("0件");
    expect(formatFeatureCountLabel(21, 20)).toBe("21件 / 20件ずつ表示");
  });

  it("formats JSON safely", () => {
    expect(formatJson(undefined)).toBe("null");
  });

  it("exposes labels for P0, P1, and P2 feature display", () => {
    expect(phase2FeatureGroupLabels.p0).toContain("P0");
    expect(phase2FeatureGroupLabels.p1).toContain("P1");
    expect(phase2FeatureGroupLabels.p2).toContain("P2");
    expect(phase2FeatureLabels["horse.course_top3_rate"]).toBe(
      "同コース3着内率",
    );
    expect(phase2FeatureLabels["jockey.distance_top3_rate"]).toBe(
      "騎手・同距離3着内率",
    );
  });
});
