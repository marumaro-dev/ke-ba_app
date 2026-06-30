import { describe, expect, it } from "vitest";

import { resolveInternalId, toExternalKey } from "./ids";

describe("csv import ids", () => {
  it("uses csv id when present", () => {
    expect(
      resolveInternalId(
        "70000000-0000-4000-8000-000000000001",
        "provider",
        "race",
        "external",
      ),
    ).toBe("70000000-0000-4000-8000-000000000001");
  });

  it("generates deterministic UUIDs from provider, entity type and source id", () => {
    const first = resolveInternalId("", "provider", "horse", "HORSE-001");
    const second = resolveInternalId(undefined, "provider", "horse", "HORSE-001");

    expect(first).toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("builds external keys", () => {
    expect(toExternalKey("licensed_csv_demo", "DEMO-HORSE-001")).toBe(
      "licensed_csv_demo:DEMO-HORSE-001",
    );
  });
});
