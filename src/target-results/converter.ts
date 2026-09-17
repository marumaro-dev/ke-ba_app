import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  horseCsvSchema,
  jockeyCsvSchema,
  raceCsvSchema,
  raceEntryCsvSchema,
  raceResultCsvSchema,
  trainerCsvSchema,
} from "../db/csv-import/schemas";

export type ConvertTargetResultsOptions = {
  input: string;
  outputDir: string;
  providerCode: string;
  raceDate: string;
  venue: string;
  venueCode: string;
  asOfAt: string;
  overwrite?: boolean;
};

type CsvRow = Record<string, string>;
type EntityType = "horse" | "jockey" | "trainer";

const HASH_LENGTH = 24;
const FILES = {
  races: "races.sample.csv",
  horses: "horses.sample.csv",
  jockeys: "jockeys.sample.csv",
  trainers: "trainers.sample.csv",
  raceEntries: "race_entries.sample.csv",
  raceResults: "race_results.sample.csv",
} as const;

const HEADERS = {
  races: [
    "id", "provider_code", "source_race_id", "race_date", "venue",
    "race_number", "name", "scheduled_start_at", "surface",
    "distance_meters", "weather", "track_condition", "status",
    "available_at", "observed_at", "imported_at",
  ],
  horses: [
    "id", "provider_code", "source_horse_id", "name", "birth_date", "sex",
    "color", "available_at", "observed_at", "imported_at",
  ],
  jockeys: [
    "id", "provider_code", "source_jockey_id", "name", "available_at",
    "observed_at", "imported_at",
  ],
  trainers: [
    "id", "provider_code", "source_trainer_id", "name", "affiliation",
    "available_at", "observed_at", "imported_at",
  ],
  raceEntries: [
    "id", "provider_code", "source_entry_id", "source_race_id",
    "source_horse_id", "source_jockey_id", "source_trainer_id", "frame_number",
    "horse_number", "assigned_weight", "body_weight", "body_weight_diff",
    "status", "available_at", "observed_at", "imported_at",
  ],
  raceResults: [
    "id", "provider_code", "source_result_id", "source_entry_id",
    "finish_position", "finish_status", "finish_time_milliseconds", "margin",
    "final_odds", "popularity", "status", "available_at", "observed_at",
    "imported_at",
  ],
} as const;

const RESULT_ROW = /^\s*(\d+|止|消|失|外)\s+(\d+)\s+(\d+)\s+(.+?)\s+(牡|牝|セ|騙)\s*(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?[▲△◇☆]?)\s+(\d+\.\d{2}\.\d|------)\s+(\d+\.\d|----)\s+(\d+|--)\s+(\d+|---)\s+\(([^)]*)\)(.+?)\s*$/;

export async function convertTargetResults(options: ConvertTargetResultsOptions) {
  validateOptions(options);
  const bytes = await readFile(options.input);
  const text = decodeTargetText(bytes).normalize("NFKC");
  const rows = buildRows(text, options);
  validateRows(rows);

  const csvByKey = Object.fromEntries(
    (Object.keys(FILES) as Array<keyof typeof FILES>).map((key) => [
      key,
      serializeCsv(HEADERS[key], rows[key]),
    ]),
  ) as Record<keyof typeof FILES, string>;

  validateSerializedHeaders(csvByKey);
  await writeOutput(options.outputDir, csvByKey, options.overwrite ?? false);

  return {
    outputDir: path.resolve(options.outputDir),
    files: FILES,
    rowCounts: Object.fromEntries(
      (Object.keys(FILES) as Array<keyof typeof FILES>).map((key) => [
        key,
        rows[key].length,
      ]),
    ) as Record<keyof typeof FILES, number>,
  };
}

function buildRows(text: string, options: ConvertTargetResultsOptions) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const markers = lines
    .map((line, index) => ({ index, match: line.match(/^\s*(\d{1,2})R(?:\s+(.+?))?\s*$/) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match));

  if (markers.length === 0) throw new Error("No race markers were found.");

  const dateKey = options.raceDate.replaceAll("-", "");
  const idProvider = normalizeIdPart(options.providerCode, "provider-code");
  const venueCode = normalizeIdPart(options.venueCode, "venue-code");
  const asOfAt = new Date(options.asOfAt).toISOString();
  // TARGET start times are not parsed yet, so every race currently receives this same fallback time.
  const scheduledStartAt = `${options.raceDate}T00:00:00+09:00`;

  const common = {
    id: "",
    provider_code: options.providerCode,
    available_at: asOfAt,
    observed_at: asOfAt,
    imported_at: "",
  };

  const races: CsvRow[] = [];
  const horses = new Map<string, CsvRow>();
  const jockeys = new Map<string, CsvRow>();
  const trainers = new Map<string, CsvRow>();
  const raceEntries: CsvRow[] = [];
  const raceResults: CsvRow[] = [];

  for (const [markerIndex, marker] of markers.entries()) {
    const blockEnd = markers[markerIndex + 1]?.index ?? lines.length;
    const raceNumber = Number(marker.match[1]);
    const dateLine = findPreviousLine(lines, marker.index, (line) => line.includes(options.venue));
    assertDateLine(dateLine, options.raceDate, options.venue);
    const details = findNextLineInRange(lines, marker.index + 1, blockEnd, (line) => Boolean(line.trim()) && !isSeparator(line));
    const detailMatch = details.match(/(芝|ダート|障害)\s*(\d+)m(?:[^\d]+(\d+)頭立)?/);
    if (!detailMatch) throw new Error(`Race ${raceNumber}: surface and distance could not be parsed.`);

    const tableHeaderIndex = findNextIndexInRange(
      lines,
      marker.index + 1,
      blockEnd,
      (line) => ["馬名", "性齢", "騎手", "斤量", "タイム"].every((label) => line.includes(label)),
    );
    const resultLines = collectResultLines(lines, tableHeaderIndex + 1, blockEnd);
    const declared = detailMatch[3] ? Number(detailMatch[3]) : null;
    if (declared !== null && declared !== resultLines.length) {
      throw new Error(`Race ${raceNumber}: declared runners (${declared}) do not match result rows (${resultLines.length}).`);
    }

    const sourceRaceId = `${idProvider}_${dateKey}_${venueCode}_${raceNumber}`;
    const raceName = marker.match[2]?.trim() || details.split("(", 1)[0].trim();
    const weather = dateLine.match(/天候\s*:\s*(\S+)/)?.[1] ?? "";
    const trackCondition = dateLine.match(/(?:芝|ダート|障害|馬場(?:状態)?)\s*:?\s*(良|稍重|重|不良)/)?.[1] ?? "";
    races.push({
      ...common,
      source_race_id: sourceRaceId,
      race_date: options.raceDate,
      venue: options.venue,
      race_number: String(raceNumber),
      name: raceName,
      scheduled_start_at: scheduledStartAt,
      surface: mapSurface(detailMatch[1]),
      distance_meters: detailMatch[2],
      weather,
      track_condition: trackCondition,
      status: "confirmed",
    });

    for (const line of resultLines) {
      const parsed = parseResultLine(line);
      const sourceHorseId = entitySourceId(idProvider, "horse", parsed.horseName);
      const sourceJockeyId = entitySourceId(idProvider, "jockey", parsed.jockeyName);
      const sourceTrainerId = entitySourceId(idProvider, "trainer", parsed.trainerName);
      const sourceEntryId = `${sourceRaceId}_${parsed.horseNumber}`;

      addUniqueEntity(horses, sourceHorseId, {
        ...common,
        source_horse_id: sourceHorseId,
        name: parsed.horseName,
        birth_date: "",
        sex: mapSex(parsed.sex),
        color: "",
      });
      addUniqueEntity(jockeys, sourceJockeyId, {
        ...common,
        source_jockey_id: sourceJockeyId,
        name: parsed.jockeyName,
      });
      addUniqueEntity(trainers, sourceTrainerId, {
        ...common,
        source_trainer_id: sourceTrainerId,
        name: parsed.trainerName,
        affiliation: mapAffiliation(parsed.affiliation),
      });

      raceEntries.push({
        ...common,
        source_entry_id: sourceEntryId,
        source_race_id: sourceRaceId,
        source_horse_id: sourceHorseId,
        source_jockey_id: sourceJockeyId,
        source_trainer_id: sourceTrainerId,
        frame_number: String(parsed.frameNumber),
        horse_number: String(parsed.horseNumber),
        assigned_weight: parsed.assignedWeight,
        body_weight: parsed.bodyWeight,
        body_weight_diff: "",
        status: parsed.isExcluded ? "excluded" : parsed.finishStatus === "scratched" ? "scratched" : "running",
      });
      if (parsed.finishStatus !== null) {
        raceResults.push({
          ...common,
          source_result_id: `${sourceEntryId}_result`,
          source_entry_id: sourceEntryId,
          finish_position: parsed.finishPosition,
          finish_status: parsed.finishStatus,
          finish_time_milliseconds: parsed.finishTimeMilliseconds,
          margin: "",
          final_odds: "",
          popularity: parsed.popularity,
          status: "confirmed",
        });
      }
    }
  }

  return {
    races,
    horses: [...horses.values()],
    jockeys: [...jockeys.values()],
    trainers: [...trainers.values()],
    raceEntries,
    raceResults,
  };
}

function parseResultLine(line: string) {
  const match = line.match(RESULT_ROW);
  if (!match) throw new Error("A result row does not match the supported TARGET layout.");
  const finish = match[1];
  const isExcluded = finish === "外";
  const finishStatus = isExcluded
    ? null
    : /^\d+$/.test(finish)
    ? "finished"
    : ({ 止: "did_not_finish", 消: "scratched", 失: "disqualified" } as const)[finish as "止" | "消" | "失"];
  if (!isExcluded && !finishStatus) throw new Error(`Unknown finish status: ${finish}`);

  return {
    frameNumber: Number(match[2]),
    horseNumber: Number(match[3]),
    horseName: normalizeName(match[4]),
    sex: match[5],
    jockeyName: normalizeName(match[7]),
    assignedWeight: match[8].replace(/[▲△◇☆]/g, ""),
    finishPosition: /^\d+$/.test(finish) ? finish : "",
    finishStatus,
    isExcluded,
    finishTimeMilliseconds: parseFinishTime(match[9]),
    popularity: match[11] === "--" ? "" : match[11],
    bodyWeight: match[12] === "---" ? "" : match[12],
    affiliation: match[13],
    trainerName: normalizeName(match[14]),
  };
}

function parseFinishTime(value: string) {
  if (value === "------") return "";
  const match = value.match(/^(\d+)\.(\d{2})\.(\d)$/);
  if (!match) throw new Error(`Unsupported finish time: ${value}`);
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const tenths = Number(match[3]);
  if (seconds >= 60) throw new Error(`Unsupported finish time: ${value}`);
  return String((minutes * 60 + seconds) * 1000 + tenths * 100);
}

function validateRows(rows: ReturnType<typeof buildRows>) {
  const specifications = [
    ["races", rows.races, raceCsvSchema, "source_race_id"],
    ["horses", rows.horses, horseCsvSchema, "source_horse_id"],
    ["jockeys", rows.jockeys, jockeyCsvSchema, "source_jockey_id"],
    ["trainers", rows.trainers, trainerCsvSchema, "source_trainer_id"],
    ["race_entries", rows.raceEntries, raceEntryCsvSchema, "source_entry_id"],
    ["race_results", rows.raceResults, raceResultCsvSchema, "source_result_id"],
  ] as const;

  for (const [name, records, schema, idColumn] of specifications) {
    const ids = new Set<string>();
    for (const record of records) {
      const parsed = schema.safeParse(record);
      if (!parsed.success) throw new Error(`${name} schema validation failed: ${parsed.error.issues[0]?.message}`);
      const id = record[idColumn];
      if (!/^[a-z0-9_]+$/.test(id)) throw new Error(`${name} contains an invalid source ID.`);
      if (ids.has(id)) throw new Error(`${name} contains a duplicate source ID.`);
      ids.add(id);
    }
  }

  const raceIds = new Set(rows.races.map((row) => row.source_race_id));
  const horseIds = new Set(rows.horses.map((row) => row.source_horse_id));
  const jockeyIds = new Set(rows.jockeys.map((row) => row.source_jockey_id));
  const trainerIds = new Set(rows.trainers.map((row) => row.source_trainer_id));
  const entryIds = new Set(rows.raceEntries.map((row) => row.source_entry_id));

  for (const entry of rows.raceEntries) {
    if (!raceIds.has(entry.source_race_id) || !horseIds.has(entry.source_horse_id) ||
        !jockeyIds.has(entry.source_jockey_id) || !trainerIds.has(entry.source_trainer_id)) {
      throw new Error("race_entries contains an unresolved reference.");
    }
  }
  for (const result of rows.raceResults) {
    if (!entryIds.has(result.source_entry_id)) throw new Error("race_results contains an unresolved reference.");
  }
}

function entitySourceId(provider: string, entityType: EntityType, name: string) {
  const digest = createHash("sha256")
    .update(`${entityType}:${normalizeName(name)}`, "utf8")
    .digest("hex")
    .slice(0, HASH_LENGTH);
  return `${provider}_${entityType}_h_${digest}`;
}

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeIdPart(value: string, label: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(normalized)) throw new Error(`${label} must contain only lowercase letters, numbers, and underscores.`);
  return normalized;
}

function validateOptions(options: ConvertTargetResultsOptions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.raceDate)) throw new Error("race-date must use YYYY-MM-DD.");
  if (!options.venue.trim()) throw new Error("venue is required.");
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(options.asOfAt) || Number.isNaN(Date.parse(options.asOfAt))) {
    throw new Error("as-of-at must be an ISO 8601 datetime with timezone.");
  }
  normalizeIdPart(options.providerCode, "provider-code");
  normalizeIdPart(options.venueCode, "venue-code");
}

function assertDateLine(line: string, raceDate: string, venue: string) {
  const [year, month, day] = raceDate.split("-").map(Number);
  const pattern = new RegExp(`${year}年\\s*${month}月\\s*${day}日`);
  if (!pattern.test(line) || !line.includes(venue)) throw new Error("Race date or venue does not match the TARGET header.");
}

function findPreviousLine(lines: string[], start: number, predicate: (line: string) => boolean) {
  for (let index = start - 1; index >= 0; index -= 1) if (predicate(lines[index])) return lines[index];
  throw new Error("Race header line was not found.");
}

function findNextLineInRange(lines: string[], start: number, end: number, predicate: (line: string) => boolean) {
  const index = findNextIndexInRange(lines, start, end, predicate);
  return lines[index];
}

function findNextIndexInRange(lines: string[], start: number, end: number, predicate: (line: string) => boolean) {
  for (let index = start; index < end; index += 1) if (predicate(lines[index])) return index;
  throw new Error("Required line was not found in the race block.");
}

function collectResultLines(lines: string[], start: number, end: number) {
  const resultLines: string[] = [];
  let started = false;
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (isSeparator(line)) {
      if (started) break;
      continue;
    }
    if (!line.trim()) continue;
    if (/^\s*(?:\d+|止|消|失|外)\s+\d+\s+\d+\s+/.test(line)) {
      resultLines.push(line);
      started = true;
      continue;
    }
    if (/^\s*\S+\s+\d+\s+\d+\s+/.test(line)) {
      throw new Error(`Unknown finish status in result row ${index + 1}.`);
    }
  }
  if (resultLines.length === 0) throw new Error("No result rows were found in a race block.");
  return resultLines;
}

function isSeparator(line: string) {
  return /^\s*-{10,}\s*$/.test(line);
}

function mapSurface(value: string) {
  return ({ 芝: "turf", ダート: "dirt", 障害: "obstacle" } as const)[value as "芝" | "ダート" | "障害"];
}

function mapSex(value: string) {
  return ({ 牡: "male", 牝: "female", セ: "gelding", 騙: "gelding" } as const)[value as "牡" | "牝" | "セ" | "騙"];
}

function mapAffiliation(value: string) {
  return ({ 美: "美浦", 栗: "栗東" } as Record<string, string>)[value] ?? value;
}

function addUniqueEntity(target: Map<string, CsvRow>, id: string, row: CsvRow) {
  const existing = target.get(id);
  if (existing && existing.name !== row.name) throw new Error("Entity hash collision detected.");
  target.set(id, row);
}

function serializeCsv(headers: readonly string[], rows: CsvRow[]) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => escapeCsv(row[header] ?? "")).join(",")).join("\n")}\n`;
}

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function validateSerializedHeaders(csvByKey: Record<keyof typeof FILES, string>) {
  for (const key of Object.keys(FILES) as Array<keyof typeof FILES>) {
    const actual = csvByKey[key].split("\n", 1)[0];
    const expected = HEADERS[key].join(",");
    if (actual !== expected) throw new Error(`${FILES[key]} header validation failed.`);
  }
}

async function writeOutput(outputDir: string, csvByKey: Record<keyof typeof FILES, string>, overwrite: boolean) {
  const resolved = path.resolve(outputDir);
  if (await exists(resolved)) {
    if (!overwrite) throw new Error(`Output directory already exists: ${resolved}`);
    await rm(resolved, { recursive: true, force: true });
  }
  const parent = path.dirname(resolved);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, `.${path.basename(resolved)}-`));
  try {
    for (const key of Object.keys(FILES) as Array<keyof typeof FILES>) {
      await writeFile(path.join(staging, FILES[key]), csvByKey[key], "utf8");
    }
    await rename(staging, resolved);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function decodeTargetText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  }
}
