import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCsv } from "../db/csv-import/csv-parser";
import { resolveInternalId, type EntityType } from "../db/csv-import/ids";
import { bundleFiles } from "./versioning";

export const timestampColumns = [
  "available_at", "available_at_status", "observed_at", "observed_at_status",
] as const;
const timeColumns = new Set<string>(timestampColumns);
const dateScopedTables = new Set(["races", "race_entries", "race_results"]);

export function isTimestampCorrectionTable(table: string): boolean {
  return dateScopedTables.has(table);
}

/** Compare only timestamp columns by instant; reject ambiguous or invalid values. */
export function timestampsRepresentSameInstant(a: unknown, b: unknown): boolean {
  const parse = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error("timestamp_contract_invalid_timestamp");
      return value.getTime();
    }
    if (typeof value !== "string") throw new Error("timestamp_contract_invalid_timestamp");
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
    if (!match) throw new Error("timestamp_contract_invalid_timestamp");
    const [, year, month, day, hour, minute, second, fraction, zone] = match;
    const y = Number(year), m = Number(month), d = Number(day);
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    if (utcDate.getUTCFullYear() !== y || utcDate.getUTCMonth() !== m - 1
      || utcDate.getUTCDate() !== d || Number(hour) > 23 || Number(minute) > 59
      || Number(second) > 59) throw new Error("timestamp_contract_invalid_timestamp");
    let normalizedZone = zone;
    if (zone !== "Z") {
      const digits = zone.slice(1).replace(":", "");
      const offsetHour = Number(digits.slice(0, 2));
      const offsetMinute = digits.length === 2 ? 0 : Number(digits.slice(2));
      if (offsetHour > 23 || offsetMinute > 59) throw new Error("timestamp_contract_invalid_timestamp");
      normalizedZone = `${zone[0]}${digits.slice(0, 2)}:${String(offsetMinute).padStart(2, "0")}`;
    }
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ? `.${fraction}` : ""}${normalizedZone}`;
    const epoch = Date.parse(iso);
    if (Number.isNaN(epoch)) throw new Error("timestamp_contract_invalid_timestamp");
    return epoch;
  };
  return parse(a) === parse(b);
}

export type TableComparison = {
  table: string;
  rowsCompared: number;
  timestampOnlyRows: number;
  payloadMismatchRows: number;
  missingIds: number;
  extraIds: number;
  safeToApply: boolean;
};
export type TimestampContractComparison = {
  status: "existing_same" | "timestamp_contract_only" | "existing_data_conflict";
  safeToApply: boolean;
  tables: TableComparison[];
  changes: Array<{ table: string; id: string; before: Record<string, string>; after: Record<string, string> }>;
};

/** A migration plan contains only whitelisted columns; never feed it to the CSV importer. */
export function buildTimestampContractApplyPlan(comparison: TimestampContractComparison) {
  if (comparison.status !== "timestamp_contract_only" || !comparison.safeToApply) {
    throw new Error("timestamp_contract_not_safe_to_apply");
  }
  return comparison.changes.map(({ table, id, before, after }) => {
    if (!isTimestampCorrectionTable(table)) throw new Error("timestamp_contract_table_invalid");
    return {
      table, id,
      before: { available_at: before.available_at, available_at_status: before.available_at_status,
        observed_at: before.observed_at, observed_at_status: before.observed_at_status },
      update: { available_at: after.available_at, available_at_status: after.available_at_status,
        observed_at: after.observed_at, observed_at_status: after.observed_at_status },
    };
  });
}

type CsvTable = { headers: string[]; rows: Array<Record<string, string>> };

export function compareTimestampContractBundles(
  previous: Record<string, CsvTable>, candidate: Record<string, CsvTable>,
): TimestampContractComparison {
  const tables: TableComparison[] = [];
  const changes: TimestampContractComparison["changes"] = [];
  for (const file of bundleFiles) {
    const oldTable = previous[file];
    const newTable = candidate[file];
    if (!oldTable || !newTable) throw new Error("timestamp_contract_bundle_incomplete");
    const oldHeaders = new Set(oldTable.headers);
    const newHeaders = new Set(newTable.headers);
    const oldPayload = [...oldHeaders].filter((key) => !timeColumns.has(key)).sort();
    const newPayload = [...newHeaders].filter((key) => !timeColumns.has(key)).sort();
    const headersMatch = oldPayload.join("\0") === newPayload.join("\0")
      && oldHeaders.has("id") && newHeaders.has("id")
      && [...oldHeaders, ...newHeaders].every((key) => oldPayload.includes(key) || timeColumns.has(key));
    const oldById = indexById(oldTable.rows);
    const newById = indexById(newTable.rows);
    const table: TableComparison = { table: file.replace(".sample.csv", ""),
      rowsCompared: 0, timestampOnlyRows: 0, payloadMismatchRows: 0,
      missingIds: 0, extraIds: 0, safeToApply: false };
    for (const [id, before] of oldById) {
      const after = newById.get(id);
      if (!after) { table.missingIds++; continue; }
      table.rowsCompared++;
      if (!headersMatch || oldPayload.some((key) => before[key] !== after[key])) {
        table.payloadMismatchRows++;
        continue;
      }
      if (isTimestampCorrectionTable(table.table)) {
        const previousTime = Object.fromEntries(timestampColumns.map((key) => [key, before[key] ?? ""]));
        const nextTime = Object.fromEntries(timestampColumns.map((key) => [key, after[key] ?? ""]));
        const availableEqual = timestampsRepresentSameInstant(previousTime.available_at, nextTime.available_at);
        const observedEqual = timestampsRepresentSameInstant(previousTime.observed_at, nextTime.observed_at);
        if (previousTime.available_at_status !== nextTime.available_at_status
          || previousTime.observed_at_status !== nextTime.observed_at_status
          || !availableEqual || !observedEqual) {
          table.timestampOnlyRows++;
          changes.push({ table: table.table, id, before: previousTime, after: nextTime });
        }
      }
    }
    for (const id of newById.keys()) if (!oldById.has(id)) table.extraIds++;
    if (!headersMatch && table.rowsCompared === 0) table.payloadMismatchRows++;
    table.safeToApply = oldTable.rows.length === newTable.rows.length
      && table.missingIds === 0 && table.extraIds === 0 && table.payloadMismatchRows === 0;
    tables.push(table);
  }
  const safeToApply = tables.every((table) => table.safeToApply);
  return { status: !safeToApply ? "existing_data_conflict"
    : changes.length ? "timestamp_contract_only" : "existing_same",
  safeToApply, tables, changes: safeToApply ? changes : [] };
}

function indexById(rows: CsvTable["rows"]) {
  const result = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const id = row.id;
    if (!id || result.has(id)) throw new Error("timestamp_contract_invalid_or_duplicate_id");
    result.set(id, row);
  }
  return result;
}

export async function readTimestampContractBundle(directory: string): Promise<Record<string, CsvTable>> {
  const result: Record<string, CsvTable> = {};
  const identity: Record<string, { entity: EntityType; source: string }> = {
    "races.sample.csv": { entity: "race", source: "source_race_id" },
    "horses.sample.csv": { entity: "horse", source: "source_horse_id" },
    "jockeys.sample.csv": { entity: "jockey", source: "source_jockey_id" },
    "trainers.sample.csv": { entity: "trainer", source: "source_trainer_id" },
    "race_entries.sample.csv": { entity: "race_entry", source: "source_entry_id" },
    "race_results.sample.csv": { entity: "race_result", source: "source_result_id" },
  };
  for (const file of bundleFiles) {
    const text = await readFile(path.join(directory, file), "utf8");
    const headerLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
    const headers = headerLine.split(",").map((key) => key.trim());
    if (headers.length !== new Set(headers).size) throw new Error("timestamp_contract_duplicate_header");
    const { entity, source } = identity[file];
    result[file] = { headers, rows: parseCsv(text).map((row) => {
      if (!row.values.provider_code || !row.values[source]) {
        throw new Error("timestamp_contract_identity_missing");
      }
      return { ...row.values, id: resolveInternalId(row.values.id,
        row.values.provider_code, entity, row.values[source]) };
    }) };
  }
  return result;
}
