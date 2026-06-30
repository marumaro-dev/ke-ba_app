import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv-parser";

describe("parseCsv", () => {
  it("parses CSV rows with headers and row numbers", () => {
    expect(parseCsv("id,name\n1,A\n2,B\n")).toEqual([
      { rowNumber: 2, values: { id: "1", name: "A" } },
      { rowNumber: 3, values: { id: "2", name: "B" } },
    ]);
  });

  it("supports quoted commas and escaped quotes", () => {
    expect(parseCsv('id,name\n1,"A, ""quoted"" horse"\n')).toEqual([
      {
        rowNumber: 2,
        values: { id: "1", name: 'A, "quoted" horse' },
      },
    ]);
  });
});
