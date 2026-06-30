import { describe, expect, it } from "vitest";

import {
  buildFeatureBatchListHref,
  parseFeatureBatchListSearchParams,
} from "./schemas";

describe("feature batch list search params", () => {
  it("parses filters", () => {
    expect(
      parseFeatureBatchListSearchParams({
        status: "failed",
        page: "2",
      }),
    ).toEqual({
      status: "failed",
      page: 2,
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      parseFeatureBatchListSearchParams({
        status: "bad",
        page: "0",
      }),
    ).toEqual({
      status: "all",
      page: 1,
    });
  });

  it("builds shareable URLs", () => {
    expect(
      buildFeatureBatchListHref({
        status: "succeeded",
        page: 3,
      }),
    ).toBe("/features?status=succeeded&page=3");

    expect(
      buildFeatureBatchListHref({
        status: "all",
        page: 1,
      }),
    ).toBe("/features");
  });
});
