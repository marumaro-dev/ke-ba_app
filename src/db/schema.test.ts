import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { horses, jockeys, raceEntries, raceResults, races, trainers } from "./schema";

describe("base source-time schema", () => {
  it.each([races, horses, jockeys, trainers, raceEntries, raceResults])(
    "makes each timestamp nullable but requires an independent status and CHECK",
    (table) => {
      const config = getTableConfig(table);
      for (const prefix of ["available", "observed"] as const) {
        const time = config.columns.find((column) => column.name === `${prefix}_at`);
        const status = config.columns.find((column) => column.name === `${prefix}_at_status`);
        expect(time?.notNull).toBe(false);
        expect(status?.notNull).toBe(true);
        expect(status?.hasDefault).toBe(false);
        expect(config.checks.some((item) => item.name ===
          `${config.name}_${prefix}_time_status_check`)).toBe(true);
      }
    },
  );
});
