import { createHash } from "node:crypto";

import { preRaceSnapshotSchema } from "./schema";
import type { PreRaceSnapshotDto } from "./types";

/** Fingerprint version follows the validated snapshot schema version. */
export function createPreRaceSnapshotFingerprint(
  dto: PreRaceSnapshotDto,
  sourceRaceKey: string,
): string {
  if (typeof sourceRaceKey !== "string" || sourceRaceKey.trim().length === 0) {
    throw new Error("sourceRaceKey is required for a snapshot fingerprint");
  }

  const snapshot = preRaceSnapshotSchema.parse(dto);
  const entries = [...snapshot.entries].sort(
    (left, right) => left.horseNumber - right.horseNumber,
  );

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].horseNumber === entries[index].horseNumber) {
      throw new Error("Duplicate horseNumber in a pre-race snapshot");
    }
  }

  const payload = {
    schemaVersion: snapshot.schemaVersion,
    providerCode: snapshot.providerCode,
    sourceRaceKey,
    observation: snapshot.observation,
    race: snapshot.race,
    entries: entries.map((entry) => ({
      frameNumber: entry.frameNumber,
      horseNumber: entry.horseNumber,
      horseName: entry.horse.displayName,
      jockeyName: entry.jockey.displayName,
      trainerName: entry.trainer?.displayName ?? null,
      sex: entry.sex,
      age: entry.age,
      assignedWeight: entry.assignedWeight,
      interval: entry.interval,
      zi: entry.zi,
      raw: entry.raw,
    })),
  };

  return createHash("sha256")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers are not allowed in fingerprint input");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }

  throw new Error("Unsupported or undefined fingerprint input");
}
