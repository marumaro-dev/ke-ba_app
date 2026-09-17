import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { raceEntries, raceResults, races } from "../db/schema";
import { knownSourceAt } from "./source-time-safety";

describe("known source time gate", () => {
  it.each([races, raceEntries, raceResults])(
    "requires both statuses, non-null timestamps, and as-of cutoffs",
    (source) => {
      const cutoff = new Date("2026-06-14T09:00:00Z");
      const query = new PgDialect().sqlToQuery(knownSourceAt(source, cutoff)!);
      expect(query.sql).toContain('"available_at_status" =');
      expect(query.sql).toContain('"observed_at_status" =');
      expect(query.sql).toContain('"available_at" is not null');
      expect(query.sql).toContain('"observed_at" is not null');
      expect(query.sql).toContain('"available_at" <=');
      expect(query.sql).toContain('"observed_at" <=');
      expect(query.params).toEqual(["known", cutoff.toISOString(), "known", cutoff.toISOString()]);
    },
  );
});
