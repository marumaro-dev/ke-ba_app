import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm } from "node:fs/promises";
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
  asOfAtByDay: Record<string, string>;
  databaseUrl: string;
}) {
  const client = postgres(input.databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const data = (day: PreparedDay) => day as PreparedWithData;
  const venue = (code: string) => {
    const value = venueNames[code];
    if (!value) throw new Error("unsupported_venue_code");
    return value;
  };

  const operations: DailyBatchOperations = {
    async prepare(candidate: DailyCandidate, mode) {
      if (!candidate.entriesFile || !candidate.resultsFile) throw new Error("incomplete_target_day");
      const key = `${candidate.date}/${candidate.venueCode}`;
      const asOfAt = input.asOfAtByDay[key];
      if (!asOfAt || !/(?:Z|[+-]\d{2}:\d{2})$/.test(asOfAt)
        || Number.isNaN(Date.parse(asOfAt))) throw new Error("explicit_csv_as_of_at_required");
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), "target-batch-"));
      let keepTemp = true;
      try {
        const tempBundle = path.join(tempRoot, "bundle");
        await convertTargetResults({
          input: candidate.resultsFile, outputDir: tempBundle,
          providerCode: "jra_van", raceDate: candidate.date,
          venue: venue(candidate.venueCode), venueCode: candidate.venueCode,
          asOfAt, entriesFile: candidate.entriesFile,
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
