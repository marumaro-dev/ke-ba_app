import { describe, expect, it } from "vitest";

import {
  formatPredictionAdjustment,
  summarizePredictionReasons,
} from "./formatters";

describe("prediction formatters", () => {
  it("summarizes positive and negative reasons", () => {
    const summary = summarizePredictionReasons({
      components: [
        {
          key: "horse.surface_top3_rate",
          label: "同馬場区分3着内率",
          adjustment: 2.4,
          reason: "同馬場区分3着内率が平均的な基準より高めです",
        },
        {
          key: "horse.is_after_layoff_8w",
          label: "8週休み明け",
          adjustment: -2,
          reason: "8週休み明けがスコアを抑えました",
        },
      ],
    });

    expect(summary.positiveReasons).toHaveLength(1);
    expect(summary.negativeReasons).toHaveLength(1);
    expect(summary.disclaimer).toContain("勝率");
  });

  it("formats signed adjustments", () => {
    expect(formatPredictionAdjustment(1.25)).toBe("+1.3");
    expect(formatPredictionAdjustment(-2)).toBe("-2.0");
  });
});
