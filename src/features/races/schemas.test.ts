import { describe, expect, it } from "vitest";

import {
  buildRaceListHref,
  parseRaceListSearchParams,
} from "./schemas";

describe("race list search params", () => {
  it("parses valid filters from URL search params", () => {
    expect(
      parseRaceListSearchParams({
        raceDate: "2026-06-27",
        venue: "東京",
        surface: "turf",
        page: "2",
      }),
    ).toEqual({
      raceDate: "2026-06-27",
      venue: "東京",
      surface: "turf",
      page: 2,
    });
  });

  it("falls back to safe defaults for invalid values", () => {
    expect(
      parseRaceListSearchParams({
        raceDate: "invalid",
        surface: "jump",
        page: "-1",
      }),
    ).toEqual({
      raceDate: undefined,
      venue: undefined,
      surface: "all",
      page: 1,
    });
  });

  it("builds shareable race list URLs without empty defaults", () => {
    expect(
      buildRaceListHref({
        raceDate: "2026-06-27",
        venue: "東京",
        surface: "dirt",
        page: 3,
      }),
    ).toBe(
      "/races?raceDate=2026-06-27&venue=%E6%9D%B1%E4%BA%AC&surface=dirt&page=3",
    );

    expect(
      buildRaceListHref({
        raceDate: undefined,
        venue: undefined,
        surface: "all",
        page: 1,
      }),
    ).toBe("/races");
  });
});
