import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CsvImportError, formatImportError, zodIssuesToDetails } from "./errors";

describe("csv import errors", () => {
  it("formats import errors with file and row details", () => {
    const error = new CsvImportError("CSV validation failed.", [
      {
        file: "horses.sample.csv",
        rowNumber: 3,
        entityType: "horse",
        sourceId: "DEMO-HORSE-001",
        code: "VALIDATION_ERROR",
        message: "name: Required",
        rawRow: { source_horse_id: "DEMO-HORSE-001" },
      },
    ]);

    expect(formatImportError(error)).toContain(
      "horses.sample.csv / row 3 / source DEMO-HORSE-001",
    );
  });

  it("converts zod issues to persistable error details", () => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse({ name: "" });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(
        zodIssuesToDetails(
          "horses.sample.csv",
          2,
          "horse",
          "DEMO-HORSE-001",
          { source_horse_id: "DEMO-HORSE-001", name: "" },
          parsed.error,
        ),
      ).toEqual([
        expect.objectContaining({
          file: "horses.sample.csv",
          rowNumber: 2,
          entityType: "horse",
          sourceId: "DEMO-HORSE-001",
          code: "VALIDATION_ERROR",
          rawRow: { source_horse_id: "DEMO-HORSE-001", name: "" },
        }),
      ]);
    }
  });
});
