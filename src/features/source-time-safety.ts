import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** A source is usable only when both independently recorded times are known by as-of. */
export function knownSourceAt(source: {
  availableAt: AnyPgColumn;
  availableAtStatus: AnyPgColumn;
  observedAt: AnyPgColumn;
  observedAtStatus: AnyPgColumn;
}, asOfAt: Date) {
  return and(
    eq(source.availableAtStatus, "known"),
    isNotNull(source.availableAt),
    lte(source.availableAt, asOfAt),
    eq(source.observedAtStatus, "known"),
    isNotNull(source.observedAt),
    lte(source.observedAt, asOfAt),
  );
}
