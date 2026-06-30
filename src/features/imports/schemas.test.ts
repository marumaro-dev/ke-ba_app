import { describe, expect, it } from "vitest";

import {
  buildImportListHref,
  parseImportListSearchParams,
} from "./schemas";

describe("import list search params", () => {
  it("parses valid filters", () => {
    expect(
      parseImportListSearchParams({
        mode: "dry_run",
        status: "failed",
        page: "2",
      }),
    ).toEqual({
      mode: "dry_run",
      status: "failed",
      page: 2,
    });
  });

  it("falls back to defaults for invalid filters", () => {
    expect(
      parseImportListSearchParams({
        mode: "invalid",
        status: "unknown",
        page: "0",
      }),
    ).toEqual({
      mode: "all",
      status: "all",
      page: 1,
    });
  });

  it("builds shareable URLs", () => {
    expect(
      buildImportListHref({
        mode: "import",
        status: "succeeded",
        page: 3,
      }),
    ).toBe("/imports?mode=import&status=succeeded&page=3");

    expect(
      buildImportListHref({
        mode: "all",
        status: "all",
        page: 1,
      }),
    ).toBe("/imports");
  });
});
