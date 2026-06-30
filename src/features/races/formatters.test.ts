import { describe, expect, it } from "vitest";

import {
  formatBodyWeight,
  formatFinishPosition,
  formatFinishTime,
  formatRaceCountLabel,
} from "./formatters";

describe("race formatters", () => {
  it("formats finish time in minutes and seconds", () => {
    expect(formatFinishTime(93400)).toBe("1:33.4");
    expect(formatFinishTime(null)).toBe("—");
  });

  it("formats body weight changes", () => {
    expect(formatBodyWeight(480, 4)).toBe("480kg (+4)");
    expect(formatBodyWeight(472, -2)).toBe("472kg (-2)");
    expect(formatBodyWeight(null, null)).toBe("未発表");
  });

  it("uses the finish status when no numeric position exists", () => {
    expect(formatFinishPosition(null, "did_not_finish")).toBe("中止");
    expect(formatFinishPosition(null, "disqualified")).toBe("失格");
    expect(formatFinishPosition(1, "finished")).toBe("1着");
  });

  it("formats race count labels", () => {
    expect(formatRaceCountLabel(0, 12)).toBe("0件");
    expect(formatRaceCountLabel(25, 12)).toBe("25件 / 12件ずつ表示");
  });
});
