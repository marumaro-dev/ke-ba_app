import { describe, expect, it } from "vitest";

import { assertMigrationRows } from "./migration-guard";

describe("Production migration guard", () => {
  const expected = [{ hash: "synthetic-a", when: 1 }, { hash: "synthetic-b", when: 2 }];
  it("accepts exact ordered history", () => {
    expect(assertMigrationRows([{ hash: "synthetic-a", created_at: "1" },
      { hash: "synthetic-b", created_at: 2 }], expected)).toBe(2);
  });
  it("rejects missing, extra, or changed history", () => {
    expect(() => assertMigrationRows([], expected)).toThrow();
    expect(() => assertMigrationRows([{ hash: "synthetic-a", created_at: 1 },
      { hash: "wrong", created_at: 2 }], expected)).toThrow();
    expect(() => assertMigrationRows([{ hash: "synthetic-b", created_at: 2 },
      { hash: "synthetic-a", created_at: 1 }], expected)).toThrow();
  });
});
