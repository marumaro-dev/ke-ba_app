import { describe, expect, it, vi } from "vitest";

import type { DailyCandidate } from "./discover";
import { processTargetDays, type DailyBatchOperations, type PreparedDay } from "./pipeline";

const candidate = (date: string, status: "complete" | "incomplete" = "complete"): DailyCandidate => ({
  date, venueCode: "hanshin", status,
  entriesFile: status === "complete" ? "synthetic-entries.txt" : null,
  resultsFile: "synthetic-results.txt",
});

function fake(overrides: Partial<DailyBatchOperations> = {}) {
  const operations: DailyBatchOperations = {
    prepare: vi.fn(async (day) => ({ date: day.date, venueCode: day.venueCode,
      bundleDir: "synthetic-bundle", bundleVersion: "v001", versionStatus: "new_version",
      counts: { races: 1, entries: 2, results: 1 }, snapshotCount: 1,
      cleanup: vi.fn(async () => undefined) } satisfies PreparedDay)),
    previewState: vi.fn(async () => "empty" as const),
    csvDryRun: vi.fn(async () => ({ failed: 0, skipped: 0, batchId: "synthetic-dry" })),
    csvImport: vi.fn(async () => ({ failed: 0, skipped: 0, batchId: "synthetic-import" })),
    snapshotDryRun: vi.fn(async () => ({ wouldInsert: 1, duplicate: 0, conflict: 0 })),
    snapshotSave: vi.fn(async () => ({ wouldInsert: 1, duplicate: 0, conflict: 0 })),
    backfillDryRun: vi.fn(async () => ({ races: 1, raceEntries: 2, horses: 2, jockeys: 1, trainers: 0 })),
    backfillSave: vi.fn(async () => ({ races: 1, raceEntries: 2, horses: 2, jockeys: 1, trainers: 0 })),
    verify: vi.fn(async () => ({ counts: { races: 1, entries: 2, results: 1 }, snapshots: 1,
      links: { races: 1, raceEntries: 2, horses: 2, jockeys: 1, trainers: 0 } })),
    ...overrides,
  };
  return operations;
}

describe("daily target batch coordinator", () => {
  it("completes one date in order and permits partial jockey resolution", async () => {
    const order: string[] = [];
    const base = fake();
    for (const name of ["prepare", "previewState", "csvDryRun", "csvImport", "snapshotDryRun",
      "snapshotSave", "backfillDryRun", "backfillSave", "verify"] as const) {
      const original = base[name] as (...args: never[]) => Promise<unknown>;
      (base as unknown as Record<string, unknown>)[name] = async (...args: never[]) => {
        order.push(name); return original(...args);
      };
    }
    const report = await processTargetDays([candidate("2027-02-01")], "apply", base);
    expect(report.days[0].status).toBe("completed");
    expect(report.days[0]).toMatchObject({ jockeyLinks: 1, trainerLinks: 0 });
    expect(order).toEqual(["prepare", "previewState", "csvDryRun", "csvImport",
      "snapshotDryRun", "snapshotSave", "backfillDryRun", "backfillSave", "verify"]);
  });

  it("handles multiple independent dates", async () => {
    const report = await processTargetDays([candidate("2027-02-01"), candidate("2027-02-02")],
      "apply", fake());
    expect(report.totals).toMatchObject({ discovered: 2, completed: 2,
      races: 2, entries: 4, results: 2 });
  });

  it("reports missing entries and missing results without DB processing", async () => {
    const ops = fake();
    const missingResults = { ...candidate("2027-02-02"), resultsFile: null,
      status: "incomplete" as const };
    const report = await processTargetDays([candidate("2027-02-01", "incomplete"),
      missingResults], "apply", ops);
    expect(report.totals.incomplete).toBe(2);
    expect(ops.prepare).not.toHaveBeenCalled();
  });

  it("plans without invoking any write stage", async () => {
    const ops = fake();
    const report = await processTargetDays([candidate("2027-02-01")], "dry_run", ops);
    expect(report.days[0].status).toBe("planned");
    for (const name of ["csvDryRun", "csvImport", "snapshotSave", "backfillSave"] as const) {
      expect(ops[name]).not.toHaveBeenCalled();
    }
  });

  it("treats an already imported bundle and duplicate snapshot as normal", async () => {
    const ops = fake({
      previewState: vi.fn(async () => "same" as const),
      snapshotDryRun: vi.fn(async () => ({ wouldInsert: 0, duplicate: 1, conflict: 0 })),
      snapshotSave: vi.fn(async () => ({ wouldInsert: 0, duplicate: 1, conflict: 0 })),
    });
    const report = await processTargetDays([candidate("2027-02-01")], "apply", ops);
    expect(report.days[0].status).toBe("skipped_same");
    expect(ops.csvImport).not.toHaveBeenCalled();
  });

  it.each([
    ["converter", { prepare: vi.fn(async () => { throw new Error("converter_failure"); }) }, "csvDryRun"],
    ["validation", { prepare: vi.fn(async () => { throw new Error("validation_failure"); }) }, "csvDryRun"],
    ["Preview dry-run", { csvDryRun: vi.fn(async () => ({ failed: 1, skipped: 0, batchId: "dry" })) }, "csvImport"],
    ["import", { csvImport: vi.fn(async () => { throw new Error("import_failure"); }) }, "snapshotSave"],
  ] as const)("stops the current date after %s failure", async (_label, override, later) => {
    const ops = fake(override as Partial<DailyBatchOperations>);
    const report = await processTargetDays([candidate("2027-02-01")], "apply", ops);
    expect(report.days[0].status).toBe("failed");
    expect(ops[later]).not.toHaveBeenCalled();
  });

  it("rejects a content conflict before the CSV dry-run", async () => {
    const ops = fake({ previewState: vi.fn(async () => "conflict" as const) });
    const report = await processTargetDays([candidate("2027-02-01")], "apply", ops);
    expect(report.days[0].status).toBe("failed");
    expect(ops.csvDryRun).not.toHaveBeenCalled();
  });

  it("stops after snapshot conflict, and after unsafe FK resolution", async () => {
    const snapshotOps = fake({ snapshotDryRun: vi.fn(async () => ({ wouldInsert: 0, duplicate: 0, conflict: 1 })) });
    expect((await processTargetDays([candidate("2027-02-01")], "apply", snapshotOps))
      .days[0].status).toBe("failed");
    expect(snapshotOps.snapshotSave).not.toHaveBeenCalled();
    const linkOps = fake({ backfillDryRun: vi.fn(async () => ({ races: 1,
      raceEntries: 1, horses: 1, jockeys: 0, trainers: 0 })) });
    expect((await processTargetDays([candidate("2027-02-01")], "apply", linkOps))
      .days[0].status).toBe("failed");
    expect(linkOps.backfillSave).not.toHaveBeenCalled();
  });
});
