import { describe, expect, it } from "vitest";

import { formatImportCount, formatImportCountLabel, formatJson } from "./formatters";

describe("import formatters", () => {
  it("formats counts", () => {
    expect(formatImportCount(12345)).toBe("12,345");
    expect(formatImportCountLabel(0, 20)).toBe("0件");
    expect(formatImportCountLabel(21, 20)).toBe("21件 / 20件ずつ表示");
  });

  it("formats JSON for details", () => {
    expect(formatJson({ ok: true })).toBe('{\n  "ok": true\n}');
  });
});
