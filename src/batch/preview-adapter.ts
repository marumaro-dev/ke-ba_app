import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { importCsv, validateCsvBundle } from "../db/csv-import/importer";
import { backfillPreRaceLinks } from "../db/pre-race-link-backfill";
import { createPreRaceSnapshotRepository } from "../db/pre-race-snapshot-repository";
import { importBatches, preRaceEntrySnapshots, preRaceSnapshots, raceEntries,
  raceResults, races } from "../db/schema";
import * as schema from "../db/schema";
import { createPreRaceSnapshotFingerprint } from "../pre-race-snapshots/fingerprint";
import { mapTargetEntriesToPreRaceSnapshots } from "../pre-race-snapshots/mapper";
import { savePreRaceSnapshot } from "../pre-race-snapshots/save";
import type { PreRaceSnapshotDto } from "../pre-race-snapshots/types";
import { parseTargetEntriesBytes } from "../target-entries/parser";
import { convertTargetResults } from "../target-results/converter";
import type { DailyCandidate } from "./discover";
import type { Counts, DailyBatchOperations, LinkCounts, PreparedDay,
  SnapshotCounts } from "./pipeline";
import { buildTimestampContractApplyPlan, compareTimestampContractBundles,
  isTimestampCorrectionTable, readTimestampContractBundle, timestampsRepresentSameInstant,
  type TimestampContractComparison } from "./timestamp-contract";
import { bundleChecksum, selectBundleVersion } from "./versioning";

const venueNames: Record<string, string> = {
  sapporo: "札幌", hakodate: "函館", fukushima: "福島", niigata: "新潟",
  tokyo: "東京", nakayama: "中山", chukyo: "中京", kyoto: "京都",
  hanshin: "阪神", kokura: "小倉",
};
const parserOnlyTimestamp = "1970-01-01T00:00:00Z";

type PreparedWithData = PreparedDay & {
  dtos: PreRaceSnapshotDto[];
  sourceRaceKeys: Map<number, string>;
  raceDetails: Awaited<ReturnType<typeof validateCsvBundle>>["races"];
};

/** The caller owns the one Preview connection and closes it after the batch. */
export function createPreviewBatchAdapter(input: {
  csvRoot: string;
  sourceTimesByDay: Record<string, { availableAt?: string; observedAt?: string }>;
  databaseUrl: string;
}) {
  const client = postgres(input.databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const data = (day: PreparedDay) => day as PreparedWithData;
  const contractSources = new Map<string, string>();
  const venue = (code: string) => {
    const value = venueNames[code];
    if (!value) throw new Error("unsupported_venue_code");
    return value;
  };

  const operations: DailyBatchOperations = {
    async prepare(candidate: DailyCandidate, mode) {
      if (!candidate.entriesFile || !candidate.resultsFile) throw new Error("incomplete_target_day");
      const key = `${candidate.date}/${candidate.venueCode}`;
      const sourceTimes = input.sourceTimesByDay[key] ?? {};
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), "target-batch-"));
      let keepTemp = true;
      try {
        const tempBundle = path.join(tempRoot, "bundle");
        await convertTargetResults({
          input: candidate.resultsFile, outputDir: tempBundle,
          providerCode: "jra_van", raceDate: candidate.date,
          venue: venue(candidate.venueCode), venueCode: candidate.venueCode,
          availableAt: sourceTimes.availableAt, observedAt: sourceTimes.observedAt,
          entriesFile: candidate.entriesFile,
        });
        const report = await validateCsvBundle(tempBundle);
        const entryBytes = await readFile(candidate.entriesFile);
        const parsed = parseTargetEntriesBytes(entryBytes, {
          // Parser API requires a timestamp; it is discarded and never used as observation time.
          observedAt: parserOnlyTimestamp,
        });
        const dtos = mapTargetEntriesToPreRaceSnapshots(parsed, {
          observation: { timeStatus: "unknown", observedAt: null },
          source: { fileName: path.basename(candidate.entriesFile),
            checksum: createHash("sha256").update(entryBytes).digest("hex") },
        });
        if (report.races.length !== dtos.length || dtos.some((dto) => {
          const row = report.races.find((item) => item.raceNumber === dto.race.raceNumber);
          return !row || row.raceDate !== dto.race.raceDate || row.venue !== dto.race.venue
            || row.entries !== dto.entries.length || row.entries !== dto.race.declaredEntries
            || row.scheduledStartAt.getTime() !== new Date(dto.race.scheduledStartAt).getTime()
            || row.surface !== dto.race.surface || row.distanceMeters !== dto.race.distanceMeters;
        })) throw new Error("entries_results_race_mismatch");
        const sourceRaceKeys = new Map(report.races.map((row) => [row.raceNumber, row.sourceRaceId]));
        const baseDir = path.join(input.csvRoot, "jra_van", candidate.date.slice(0, 4),
          candidate.date, candidate.venueCode);
        const chosen = await selectBundleVersion(baseDir, await bundleChecksum(tempBundle));
        let bundleDir = tempBundle;
        if (mode === "apply") {
          if (chosen.status === "new_version") {
            assertInside(input.csvRoot, chosen.directory);
            await mkdir(baseDir, { recursive: true });
            await rename(tempBundle, chosen.directory);
          }
          bundleDir = chosen.directory;
        }
        const prepared: PreparedWithData = {
          date: candidate.date, venueCode: candidate.venueCode,
          bundleDir, bundleVersion: chosen.version, versionStatus: chosen.status,
          counts: { races: report.rowCounts.races, entries: report.rowCounts.raceEntries,
            results: report.rowCounts.raceResults },
          snapshotCount: dtos.length,
          dtos, sourceRaceKeys, raceDetails: report.races,
          async cleanup() { await removeTemp(tempRoot); },
        };
        keepTemp = false;
        return prepared;
      } finally {
        if (keepTemp) await removeTemp(tempRoot);
      }
    },

    async previewState(day) {
      const current = await readCounts(day.date, venue(day.venueCode));
      if (current.races === 0 && current.entries === 0 && current.results === 0) return "empty";
      if (data(day).versionStatus !== "existing_same"
        || !equalCounts(current, day.counts)) return "conflict";
      const receipts = await db.select({ id: importBatches.id }).from(importBatches).where(and(
        eq(importBatches.sourceDir, day.bundleDir), eq(importBatches.mode, "import"),
        eq(importBatches.status, "succeeded"),
      )).limit(1);
      if (!receipts.length) return "conflict";
      const currentRaces = await db.select({ raceNumber: races.raceNumber,
        scheduledStartAt: races.scheduledStartAt, surface: races.surface,
        distanceMeters: races.distanceMeters }).from(races).where(and(
        eq(races.raceDate, day.date), eq(races.venue, venue(day.venueCode)),
      ));
      return data(day).raceDetails.every((row) => currentRaces.some((race) =>
        race.raceNumber === row.raceNumber
        && race.scheduledStartAt.getTime() === row.scheduledStartAt.getTime()
        && race.surface === row.surface && race.distanceMeters === row.distanceMeters))
        ? "same" : "conflict";
    },

    async inspectTimestampContract(day) {
      const baseDir = path.join(input.csvRoot, "jra_van", day.date.slice(0, 4),
        day.date, day.venueCode);
      const candidate = await readTimestampContractBundle(day.bundleDir);
      const receipts = await db.select({ sourceDir: importBatches.sourceDir }).from(importBatches)
        .where(and(eq(importBatches.mode, "import"), eq(importBatches.status, "succeeded")));
      const receiptDirs = new Set(receipts.map((row) => path.resolve(row.sourceDir)));
      let versions: string[];
      try {
        versions = (await readdir(baseDir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory() && /^v\d{3,}$/.test(entry.name))
          .map((entry) => path.join(baseDir, entry.name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return null;
      }
      let mismatch: TimestampContractComparison | null = null;
      for (const previousDir of versions) {
        if (path.resolve(previousDir) === path.resolve(day.bundleDir)
          || !receiptDirs.has(path.resolve(previousDir))) continue;
        const previous = await readTimestampContractBundle(previousDir);
        const result = compareTimestampContractBundles(previous, candidate);
        if (result.safeToApply) {
          const mismatches = await persistedMismatchCounts(previous,
            (query, args) => client.unsafe(query, args));
          for (const table of result.tables) {
            table.payloadMismatchRows += mismatches[table.table] ?? 0;
            table.safeToApply &&= table.payloadMismatchRows === 0;
          }
          result.safeToApply = result.tables.every((table) => table.safeToApply);
          if (!result.safeToApply) {
            result.status = "existing_data_conflict";
            result.changes = [];
            mismatch = closerMismatch(mismatch, result);
            continue;
          }
          contractSources.set(`${day.date}/${day.venueCode}`, previousDir);
          return result;
        }
        mismatch = closerMismatch(mismatch, result);
      }
      return mismatch;
    },

    async applyTimestampContract(day, comparison) {
      const previousDir = contractSources.get(`${day.date}/${day.venueCode}`);
      if (!previousDir || comparison.status !== "timestamp_contract_only") {
        throw new Error("timestamp_contract_plan_missing");
      }
      const fresh = compareTimestampContractBundles(
        await readTimestampContractBundle(previousDir),
        await readTimestampContractBundle(day.bundleDir));
      if (JSON.stringify(fresh) !== JSON.stringify(comparison)) {
        throw new Error("timestamp_contract_plan_changed");
      }
      const plan = buildTimestampContractApplyPlan(fresh);
      const previous = await readTimestampContractBundle(previousDir);
      await client.begin(async (tx) => {
        const mismatches = await persistedMismatchCounts(previous,
          (query, args) => tx.unsafe(query, args), true);
        if (Object.values(mismatches).some((count) => count > 0)) {
          throw new Error("timestamp_contract_db_payload_mismatch");
        }
        for (const change of plan) {
          if (!isTimestampCorrectionTable(change.table)) throw new Error("timestamp_contract_table_invalid");
          const rows = await tx.unsafe<Array<{ id: string }>>(
            `UPDATE "${change.table}" SET available_at = $1, available_at_status = $2, `
            + `observed_at = $3, observed_at_status = $4 WHERE id = $5 `
            + `AND available_at IS NOT DISTINCT FROM $6 AND available_at_status = $7 `
            + `AND observed_at IS NOT DISTINCT FROM $8 AND observed_at_status = $9 RETURNING id`,
            [change.update.available_at || null, change.update.available_at_status,
              change.update.observed_at || null, change.update.observed_at_status,
              change.id, change.before.available_at || null,
              change.before.available_at_status || (change.before.available_at ? "known" : "unknown"),
              change.before.observed_at || null,
              change.before.observed_at_status || (change.before.observed_at ? "known" : "unknown")]);
          if (rows.length !== 1) throw new Error("timestamp_contract_concurrent_change");
        }
      });
    },

    async csvDryRun(day) {
      const result = await importCsv({ csvDir: day.bundleDir, dryRun: true });
      return { failed: 0, skipped: result.counters.skippedRows, batchId: result.batchId };
    },
    async csvImport(day) {
      const result = await importCsv({ csvDir: day.bundleDir, dryRun: false });
      return { failed: 0, skipped: result.counters.skippedRows, batchId: result.batchId };
    },

    async snapshotDryRun(day) { return saveSnapshots(day, "dry_run"); },
    async snapshotSave(day) { return saveSnapshots(day, "save"); },
    async backfillDryRun(day) { return link(day, "dry_run"); },
    async backfillSave(day) { return link(day, "apply"); },
    async verify(day) {
      const counts = await readCounts(day.date, venue(day.venueCode));
      const parents = await db.select().from(preRaceSnapshots).where(and(
        eq(preRaceSnapshots.raceDate, day.date), eq(preRaceSnapshots.venue, venue(day.venueCode)),
      ));
      const children = await db.select().from(preRaceEntrySnapshots).where(
        inArray(preRaceEntrySnapshots.preRaceSnapshotId, parents.map((p) => p.id)),
      );
      const expectedFingerprints = new Set(data(day).dtos.map((dto) =>
        createPreRaceSnapshotFingerprint(dto, sourceRaceKey(day, dto.race.raceNumber))));
      if (parents.length !== day.snapshotCount || children.length !== day.counts.entries
        || parents.some((p) => !expectedFingerprints.has(p.snapshotFingerprint)
          || p.observationTimeStatus !== "unknown" || p.observedAt !== null
          || p.isFeatureEligible || p.eligibilityReason !== "observation_time_unknown")
        || children.some((c) => c.trainerId !== null)) {
        throw new Error("snapshot_final_state_mismatch");
      }
      return { counts, snapshots: parents.length, links: {
        races: parents.filter((p) => p.raceId).length,
        raceEntries: children.filter((c) => c.raceEntryId).length,
        horses: children.filter((c) => c.horseId).length,
        jockeys: children.filter((c) => c.jockeyId).length,
        trainers: children.filter((c) => c.trainerId).length,
      } };
    },
  };

  async function readCounts(date: string, name: string): Promise<Counts> {
    const matchedRaces = await db.select({ id: races.id }).from(races)
      .where(and(eq(races.raceDate, date), eq(races.venue, name)));
    if (!matchedRaces.length) return { races: 0, entries: 0, results: 0 };
    const ids = matchedRaces.map((r) => r.id);
    const entries = await db.select({ id: raceEntries.id }).from(raceEntries)
      .where(inArray(raceEntries.raceId, ids));
    const results = await db.select({ id: raceResults.id }).from(raceResults)
      .innerJoin(raceEntries, eq(raceResults.raceEntryId, raceEntries.id))
      .where(inArray(raceEntries.raceId, ids));
    return { races: ids.length, entries: entries.length, results: results.length };
  }

  async function saveSnapshots(day: PreparedDay, mode: "dry_run" | "save"): Promise<SnapshotCounts> {
    const existing = await db.select({ fingerprint: preRaceSnapshots.snapshotFingerprint,
      raceNumber: preRaceSnapshots.raceNumber }).from(preRaceSnapshots).where(and(
      eq(preRaceSnapshots.raceDate, day.date), eq(preRaceSnapshots.venue, venue(day.venueCode)),
    ));
    const repository = createPreRaceSnapshotRepository(db);
    const counts = { wouldInsert: 0, duplicate: 0, conflict: 0 };
    for (const dto of data(day).dtos) {
      const fingerprint = createPreRaceSnapshotFingerprint(dto, sourceRaceKey(day, dto.race.raceNumber));
      if (existing.some((row) => row.raceNumber === dto.race.raceNumber
        && row.fingerprint !== fingerprint)) throw new Error("snapshot_content_conflict");
      const result = await savePreRaceSnapshot({ dto,
        sourceRaceKey: sourceRaceKey(day, dto.race.raceNumber), repository, mode });
      if (result.status === "duplicate") counts.duplicate++;
      else counts.wouldInsert++;
    }
    return counts;
  }

  async function link(day: PreparedDay, mode: "dry_run" | "apply"): Promise<LinkCounts> {
    const result = await backfillPreRaceLinks({ db, date: day.date,
      venue: venue(day.venueCode), mode,
      expectedRaces: day.counts.races, expectedEntries: day.counts.entries });
    return { races: result.races, raceEntries: result.raceEntries,
      horses: result.horses, jockeys: result.jockeys, trainers: result.trainers };
  }

  return { operations, close: () => client.end() };
}

function sourceRaceKey(day: PreparedDay, raceNumber: number) {
  const key = (day as PreparedWithData).sourceRaceKeys.get(raceNumber);
  if (!key) throw new Error("source_race_key_missing");
  return key;
}

function equalCounts(a: Counts, b: Counts) {
  return a.races === b.races && a.entries === b.entries && a.results === b.results;
}

function assertInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("batch_directory_outside_expected_root");
  }
}

async function removeTemp(tempRoot: string) {
  assertInside(os.tmpdir(), tempRoot);
  await rm(tempRoot, { recursive: true, force: true });
}

const contractTables = new Set([
  "races", "horses", "jockeys", "trainers", "race_entries", "race_results",
]);

function closerMismatch(current: TimestampContractComparison | null,
  next: TimestampContractComparison) {
  const score = (item: TimestampContractComparison) => item.tables.reduce((total, table) =>
    total + table.payloadMismatchRows + table.missingIds + table.extraIds, 0);
  return !current || score(next) < score(current) ? next : current;
}

export async function persistedMismatchCounts(
  bundle: Record<string, { rows: Record<string, string>[] }>,
  read: (query: string, args: string[][]) => Promise<Record<string, unknown>[]>,
  lock = false,
) {
  const mismatches: Record<string, number> = {};
  for (const [file, csv] of Object.entries(bundle)) {
    const table = file.replace(".sample.csv", "");
    if (!contractTables.has(table)) throw new Error("timestamp_contract_table_invalid");
    const ids = csv.rows.map((row) => row.id);
    mismatches[table] = 0;
    if (!ids.length) continue;
    const stored = await read(`SELECT * FROM "${table}" WHERE id = ANY($1::uuid[])${lock ? " FOR UPDATE" : ""}`,
      [ids]);
    const byId = new Map(stored.map((row) => [String(row.id), row]));
    for (const row of csv.rows) {
      const found = byId.get(row.id);
      if (!found || !storedPayloadMatches(table, row, found, bundle)
        || (isTimestampCorrectionTable(table)
          && (!timestampsRepresentSameInstant(found.available_at, row.available_at)
            || !timestampsRepresentSameInstant(found.observed_at, row.observed_at)))) {
        mismatches[table]++;
      }
    }
    mismatches[table] += Math.max(0, stored.length - ids.length);
  }
  return mismatches;
}

/** Recheck persisted non-time columns under row locks before any limited UPDATE. */
function storedPayloadMatches(table: string, csv: Record<string, string>,
  stored: Record<string, unknown>, bundle: Record<string, { rows: Record<string, string>[] }>) {
  const fields: Record<string, string[]> = {
    races: ["race_date", "venue", "race_number", "name", "scheduled_start_at", "surface",
      "distance_meters", "weather", "track_condition", "status"],
    horses: ["name", "birth_date", "sex", "color"],
    jockeys: ["name"],
    trainers: ["name", "affiliation"],
    race_entries: ["frame_number", "horse_number", "assigned_weight", "body_weight",
      "body_weight_diff", "status"],
    race_results: ["finish_position", "finish_status", "finish_time_milliseconds",
      "margin", "final_odds", "popularity", "status"],
  };
  if (!fields[table] || fields[table].some((key) => key === "scheduled_start_at"
    ? !timestampsRepresentSameInstant(stored[key], csv[key])
    : !sameDbValue(stored[key], csv[key]))) return false;
  const relation: Record<string, Array<[string, string, string]>> = {
    race_entries: [
      ["source_race_id", "races.sample.csv", "race_id"],
      ["source_horse_id", "horses.sample.csv", "horse_id"],
      ["source_jockey_id", "jockeys.sample.csv", "jockey_id"],
      ["source_trainer_id", "trainers.sample.csv", "trainer_id"],
    ],
    race_results: [["source_entry_id", "race_entries.sample.csv", "race_entry_id"]],
  };
  return (relation[table] ?? []).every(([sourceKey, file, dbKey]) => {
    const sourceIdKey = sourceKey;
    const related = bundle[file]?.rows.filter((row) => row[sourceIdKey] === csv[sourceIdKey]);
    return related?.length === 1 && stored[dbKey] === related[0].id;
  });
}

function sameDbValue(stored: unknown, csv: string | undefined) {
  if (stored === null || stored === undefined) return !csv;
  if (stored instanceof Date) return Boolean(csv) && stored.getTime() === Date.parse(csv!);
  if (typeof stored === "number") return Boolean(csv) && stored === Number(csv);
  if (typeof stored === "string" && csv !== undefined && /^-?\d+(?:\.\d+)?$/.test(stored)
    && /^-?\d+(?:\.\d+)?$/.test(csv)) return Number(stored) === Number(csv);
  return String(stored) === csv;
}
