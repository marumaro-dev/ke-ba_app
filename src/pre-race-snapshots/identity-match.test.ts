import { describe, expect, it } from "vitest";

import { matchesSnapshotHorseName, matchesSnapshotJockeyName } from "./identity-match";

describe("strict snapshot identity matching", () => {
  it.each([
    ["架空馬甲", null, "架空馬甲", true],
    ["架空馬甲", "*", "*架空馬甲", true],
    ["架空馬甲", "$", "$架空馬甲", true],
    ["架空馬甲", "*", "$架空馬甲", false],
    ["架空馬", null, "架空馬甲", false],
    ["馬甲", null, "架空馬甲", false],
    ["", null, "架空馬甲", false],
    [null, null, "架空馬甲", false],
    ["架空馬甲", null, null, false],
  ] as const)("matches horse only by full equality", (raw, marker, candidate, expected) => {
    expect(matchesSnapshotHorseName(raw, marker, candidate)).toBe(expected);
  });

  it.each([
    ["架空騎手", "架空騎手", true],
    ["架空騎", "架空騎手", false],
    ["騎手", "架空騎手", false],
    ["", "架空騎手", false],
  ] as const)("matches jockey only by full equality", (raw, candidate, expected) => {
    expect(matchesSnapshotJockeyName(raw, candidate)).toBe(expected);
  });
});
