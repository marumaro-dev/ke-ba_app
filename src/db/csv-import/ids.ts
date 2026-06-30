import { createHash } from "node:crypto";

export type EntityType =
  | "race"
  | "horse"
  | "jockey"
  | "trainer"
  | "race_entry"
  | "race_result";

export function resolveInternalId(
  csvId: string | undefined,
  providerCode: string,
  entityType: EntityType,
  sourceId: string,
) {
  const trimmedCsvId = csvId?.trim();

  if (trimmedCsvId) {
    return trimmedCsvId;
  }

  return deterministicUuid(`${providerCode}:${entityType}:${sourceId}`);
}

export function toExternalKey(providerCode: string, sourceId: string) {
  return `${providerCode}:${sourceId}`;
}

function deterministicUuid(input: string) {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  const chars = hex.split("");

  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}
