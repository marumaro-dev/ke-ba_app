import type { DailyCandidate } from "./discover";
import type { TimestampContractComparison } from "./timestamp-contract";

export type Counts = { races: number; entries: number; results: number };
export type LinkCounts = {
  races: number;
  raceEntries: number;
  horses: number;
  jockeys: number;
  trainers: number;
};
export type PreparedDay = {
  date: string;
  venueCode: string;
  bundleDir: string;
  bundleVersion: string;
  versionStatus: "existing_same" | "new_version";
  counts: Counts;
  snapshotCount: number;
  cleanup(): Promise<void>;
};
export type SnapshotCounts = { wouldInsert: number; duplicate: number; conflict: number };
export type ImportCounts = { failed: number; skipped: number; batchId: string };
export type ProjectedPlan = { validRows: number; links: LinkCounts };
export type PreviewState = "empty" | "same" | "conflict";

export interface DailyBatchOperations {
  prepare(candidate: DailyCandidate, mode: "dry_run" | "apply"): Promise<PreparedDay>;
  previewState(day: PreparedDay): Promise<PreviewState>;
  inspectTimestampContract(day: PreparedDay): Promise<TimestampContractComparison | null>;
  applyTimestampContract(day: PreparedDay, comparison: TimestampContractComparison): Promise<void>;
  csvDryRun(day: PreparedDay): Promise<ImportCounts>;
  csvImport(day: PreparedDay): Promise<ImportCounts>;
  snapshotDryRun(day: PreparedDay): Promise<SnapshotCounts>;
  projectedFkDryRun(day: PreparedDay): Promise<ProjectedPlan>;
  snapshotSave(day: PreparedDay): Promise<SnapshotCounts>;
  backfillDryRun(day: PreparedDay): Promise<LinkCounts>;
  backfillSave(day: PreparedDay): Promise<LinkCounts>;
  verify(day: PreparedDay): Promise<{ counts: Counts; snapshots: number; links: LinkCounts }>;
}

export type DailySummary = {
  date: string;
  venue: string;
  status: "incomplete" | "planned" | "completed" | "skipped_same" | "failed";
  bundleVersion: string | null;
  races: number;
  entries: number;
  results: number;
  snapshots: number;
  csvValid: number;
  raceLinks: number;
  raceEntryLinks: number;
  horseLinks: number;
  jockeyLinks: number;
  trainerLinks: number;
  warnings: string[];
  errors: string[];
  timestampContract: TimestampContractComparison | null;
};

/** One date fails closed; earlier dates remain completed and later dates may continue. */
export async function processTargetDays(
  candidates: DailyCandidate[],
  mode: "dry_run" | "apply",
  operations: DailyBatchOperations,
) {
  const days: DailySummary[] = [];
  for (const candidate of candidates) {
    const summary: DailySummary = {
      date: candidate.date, venue: candidate.venueCode,
      status: "incomplete", bundleVersion: null, races: 0, entries: 0, results: 0,
      snapshots: 0, csvValid: 0, raceLinks: 0, raceEntryLinks: 0, horseLinks: 0,
      jockeyLinks: 0, trainerLinks: 0, warnings: [], errors: [], timestampContract: null,
    };
    days.push(summary);
    if (candidate.status === "incomplete") {
      summary.warnings.push("required_target_file_missing");
      continue;
    }
    let prepared: PreparedDay | undefined;
    let stage = "prepare";
    try {
      prepared = await operations.prepare(candidate, mode);
      summary.bundleVersion = prepared.bundleVersion;
      summary.races = prepared.counts.races;
      summary.entries = prepared.counts.entries;
      summary.results = prepared.counts.results;
      summary.snapshots = prepared.snapshotCount;
      stage = "preview_read";
      let existing: PreviewState | "timestamp_contract_only" = await operations.previewState(prepared);
      if (existing === "conflict") {
        stage = "timestamp_contract_compare";
        const comparison = await operations.inspectTimestampContract(prepared);
        summary.timestampContract = comparison;
        if (!comparison?.safeToApply || comparison.status === "existing_data_conflict") {
          throw new Error("existing_data_conflict");
        }
        existing = comparison.status === "existing_same" ? "same" : "timestamp_contract_only";
      }

      // A timestamp-only correction is terminal: no CSV, snapshot, or FK writes follow it.
      if (existing === "timestamp_contract_only") {
        summary.warnings.push("timestamp_contract_only");
        if (mode === "apply") {
          stage = "timestamp_contract_apply";
          await operations.applyTimestampContract(prepared, summary.timestampContract!);
          summary.status = "completed";
        } else {
          summary.status = "planned";
        }
        continue;
      }

      if (mode === "dry_run") {
        stage = "snapshot_dry_run";
        const snapshotCheck = await operations.snapshotDryRun(prepared);
        if (snapshotCheck.conflict
          || snapshotCheck.wouldInsert + snapshotCheck.duplicate !== prepared.snapshotCount) {
          throw new Error("snapshot_dry_run_conflict");
        }
        if (existing === "empty") {
          stage = "projected_fk_dry_run";
          const projected = await operations.projectedFkDryRun(prepared);
          assertLinks(projected.links, prepared);
          summary.csvValid = projected.validRows;
          summary.raceLinks = projected.links.races;
          summary.raceEntryLinks = projected.links.raceEntries;
          summary.horseLinks = projected.links.horses;
          summary.jockeyLinks = projected.links.jockeys;
          summary.trainerLinks = projected.links.trainers;
        } else if (existing === "same" && snapshotCheck.wouldInsert === 0) {
          stage = "fk_dry_run";
          const links = await operations.backfillDryRun(prepared);
          assertLinks(links, prepared);
          summary.raceLinks = links.races;
          summary.raceEntryLinks = links.raceEntries;
          summary.horseLinks = links.horses;
          summary.jockeyLinks = links.jockeys;
          summary.trainerLinks = links.trainers;
        } else {
          summary.warnings.push("fk_requires_base_import_and_snapshot_save");
        }
        summary.status = "planned";
        if (existing === "same") summary.warnings.push("existing_same");
        continue;
      }

      let projectedLinks: LinkCounts | null = null;
      if (existing === "empty") {
        stage = "projected_fk_dry_run";
        const projected = await operations.projectedFkDryRun(prepared);
        assertLinks(projected.links, prepared);
        summary.csvValid = projected.validRows;
        projectedLinks = projected.links;
      }
      if (existing !== "same") {
        stage = "csv_dry_run";
        const csvCheck = await operations.csvDryRun(prepared);
        assertImport(csvCheck);
        stage = "csv_import";
        const csvImport = await operations.csvImport(prepared);
        assertImport(csvImport);
      } else {
        summary.warnings.push("csv_already_imported");
      }

      stage = "snapshot_dry_run";
      const snapshotCheck = await operations.snapshotDryRun(prepared);
      if (snapshotCheck.conflict || snapshotCheck.wouldInsert + snapshotCheck.duplicate !== prepared.snapshotCount) {
        throw new Error("snapshot_dry_run_conflict");
      }
      stage = "snapshot_save";
      const saved = await operations.snapshotSave(prepared);
      if (saved.conflict || saved.wouldInsert + saved.duplicate !== prepared.snapshotCount) {
        throw new Error("snapshot_save_conflict");
      }
      stage = "fk_dry_run";
      const linkCheck = await operations.backfillDryRun(prepared);
      assertLinks(linkCheck, prepared);
      stage = "fk_apply";
      const links = await operations.backfillSave(prepared);
      assertLinks(links, prepared);
      if (projectedLinks && !equalLinks(projectedLinks, links)) {
        throw new Error("projected_actual_fk_mismatch");
      }
      stage = "final_verify";
      const final = await operations.verify(prepared);
      if (!equalCounts(final.counts, prepared.counts) || final.snapshots !== prepared.snapshotCount) {
        throw new Error("final_count_mismatch");
      }
      assertLinks(final.links, prepared);
      summary.raceLinks = final.links.races;
      summary.raceEntryLinks = final.links.raceEntries;
      summary.horseLinks = final.links.horses;
      summary.jockeyLinks = final.links.jockeys;
      summary.trainerLinks = final.links.trainers;
      if (final.links.jockeys < prepared.counts.entries) {
        summary.warnings.push(`jockey_unresolved:${prepared.counts.entries - final.links.jockeys}`);
      }
      summary.status = existing === "same" && saved.wouldInsert === 0
        ? "skipped_same" : "completed";
    } catch (error) {
      summary.status = "failed";
      const code = error instanceof Error ? error.message : "";
      summary.errors.push(/^[a-z][a-z0-9_]{2,80}$/.test(code)
        ? code : `${stage}_failed`);
    } finally {
      if (prepared) {
        try { await prepared.cleanup(); }
        catch { summary.status = "failed"; summary.errors.push("temporary_cleanup_failed"); }
      }
    }
  }
  return {
    days,
    totals: {
      discovered: days.length,
      completed: days.filter((d) => d.status === "completed").length,
      incomplete: days.filter((d) => d.status === "incomplete").length,
      failed: days.filter((d) => d.status === "failed").length,
      skippedSame: days.filter((d) => d.status === "skipped_same").length,
      races: days.filter((d) => ["completed", "skipped_same", "planned"].includes(d.status))
        .reduce((sum, d) => sum + d.races, 0),
      entries: days.filter((d) => ["completed", "skipped_same", "planned"].includes(d.status))
        .reduce((sum, d) => sum + d.entries, 0),
      results: days.filter((d) => ["completed", "skipped_same", "planned"].includes(d.status))
        .reduce((sum, d) => sum + d.results, 0),
    },
  };
}

function assertImport(result: ImportCounts) {
  if (result.failed !== 0 || result.skipped !== 0) throw new Error("preview_csv_import_failed");
}

function assertLinks(links: LinkCounts, day: PreparedDay) {
  if (links.races !== day.counts.races || links.raceEntries !== day.counts.entries
    || links.horses !== day.counts.entries || links.trainers !== 0) {
    throw new Error("safe_fk_backfill_incomplete");
  }
}

function equalCounts(a: Counts, b: Counts) {
  return a.races === b.races && a.entries === b.entries && a.results === b.results;
}

function equalLinks(a: LinkCounts, b: LinkCounts) {
  return a.races === b.races && a.raceEntries === b.raceEntries
    && a.horses === b.horses && a.jockeys === b.jockeys && a.trainers === b.trainers;
}
