import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { planPreRaceLinkBackfill, type LinkChild, type LinkParent } from "../pre-race-snapshots/backfill";
import { getDb } from "./index";
import { createPreRaceSnapshotRepository } from "./pre-race-snapshot-repository";
import { preRaceEntrySnapshots, preRaceSnapshots, raceEntries, raceResults, races } from "./schema";

const raceDate = "2026-06-20";
const venue = "阪神";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const save = args.has("--save");
const environment = [...args].find((arg) => arg.split("=")[0] === "--environment")?.split("=")[1];

if (dryRun === save || !["preview", "production"].includes(environment ?? "")
  || process.env.APP_ENV !== environment) {
  throw new Error("Explicit mode and matching APP_ENV are required");
}

const db = getDb();

async function run() {
  return db.transaction(async (tx) => {
    if (dryRun) await tx.execute(sql`set transaction read only`);

    const parents = await tx.select().from(preRaceSnapshots).where(and(
      eq(preRaceSnapshots.raceDate, raceDate), eq(preRaceSnapshots.venue, venue),
    ));
    if (parents.length !== 12 || new Set(parents.map((p) => p.raceNumber)).size !== 12
      || parents.some((p) => p.observationTimeStatus !== "unknown" || p.observedAt !== null
        || p.isFeatureEligible || p.eligibilityReason !== "observation_time_unknown")) {
      throw new Error("Snapshot parent precondition failed");
    }
    const snapshotIds = parents.map((p) => p.id);
    const children = await tx.select().from(preRaceEntrySnapshots).where(
      inArray(preRaceEntrySnapshots.preRaceSnapshotId, snapshotIds),
    );
    const baseRaces = await tx.select({ id: races.id, raceNumber: races.raceNumber })
      .from(races).where(and(eq(races.raceDate, raceDate), eq(races.venue, venue)));
    const baseRaceIds = baseRaces.map((r) => r.id);
    const baseEntries = await tx.select({ id: raceEntries.id }).from(raceEntries)
      .where(inArray(raceEntries.raceId, baseRaceIds));
    const baseResults = await tx.select({ id: raceResults.id }).from(raceResults)
      .innerJoin(raceEntries, eq(raceResults.raceEntryId, raceEntries.id))
      .where(inArray(raceEntries.raceId, baseRaceIds));
    if (children.length !== 177 || baseRaces.length !== 12
      || new Set(baseRaces.map((r) => r.raceNumber)).size !== 12
      || baseEntries.length !== 177 || baseResults.length !== 175) {
      throw new Error("Target date row-count precondition failed");
    }

    const immutableBefore = JSON.stringify({
      parents: parents.map(({ id, raceId: _raceId, ...other }) => [id, other]).sort(([a], [b]) => String(a).localeCompare(String(b))),
      children: children.map(({ id, raceEntryId: _raceEntryId, horseId: _horseId,
        jockeyId: _jockeyId, trainerId: _trainerId, ...other }) => [id, other])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    });
    const reader = createPreRaceSnapshotRepository(tx as unknown as Parameters<typeof createPreRaceSnapshotRepository>[0]);
    const plan = await planPreRaceLinkBackfill(
      parents as LinkParent[],
      children.map((child): LinkChild => ({
        id: child.id,
        preRaceSnapshotId: child.preRaceSnapshotId,
        horseNumber: child.horseNumber,
        horseNameRaw: child.horseNameRaw,
        jockeyNameRaw: child.jockeyNameRaw,
        rawHorseNumberMarker: child.rawFieldsJson.horseNumberMarker,
        raceEntryId: child.raceEntryId,
        horseId: child.horseId,
        jockeyId: child.jockeyId,
        trainerId: child.trainerId,
      })), reader,
    );
    if (plan.parent.resolved !== 12 || plan.child.raceEntryResolved !== 177
      || plan.child.horseResolved !== 177 || plan.child.jockeyResolved !== 30
      || plan.child.trainerResolved !== 0 || plan.parent.conflict !== 0
      || plan.child.conflict !== 0) {
      throw new Error("Strict identity resolution did not match the approved counts");
    }

    if (save) {
      for (const update of plan.parentUpdates) {
        const changed = await tx.update(preRaceSnapshots).set({ raceId: update.raceId })
          .where(and(eq(preRaceSnapshots.id, update.id), isNull(preRaceSnapshots.raceId)))
          .returning({ id: preRaceSnapshots.id });
        if (changed.length !== 1) throw new Error("Parent link changed concurrently");
      }
      for (const update of plan.childUpdates) {
        const changed = await tx.update(preRaceEntrySnapshots).set({
          raceEntryId: update.raceEntryId,
          horseId: update.horseId,
          jockeyId: update.jockeyId,
        }).where(and(eq(preRaceEntrySnapshots.id, update.id),
          update.previousRaceEntryId === null ? isNull(preRaceEntrySnapshots.raceEntryId)
            : eq(preRaceEntrySnapshots.raceEntryId, update.previousRaceEntryId),
          update.previousHorseId === null ? isNull(preRaceEntrySnapshots.horseId)
            : eq(preRaceEntrySnapshots.horseId, update.previousHorseId),
          update.previousJockeyId === null ? isNull(preRaceEntrySnapshots.jockeyId)
            : eq(preRaceEntrySnapshots.jockeyId, update.previousJockeyId)))
          .returning({ id: preRaceEntrySnapshots.id });
        if (changed.length !== 1) throw new Error("Child link changed concurrently");
      }

      const afterParents = await tx.select().from(preRaceSnapshots).where(and(
        eq(preRaceSnapshots.raceDate, raceDate), eq(preRaceSnapshots.venue, venue),
      ));
      const afterChildren = await tx.select().from(preRaceEntrySnapshots).where(
        inArray(preRaceEntrySnapshots.preRaceSnapshotId, snapshotIds),
      );
      const immutableAfter = JSON.stringify({
        parents: afterParents.map(({ id, raceId: _raceId, ...other }) => [id, other]).sort(([a], [b]) => String(a).localeCompare(String(b))),
        children: afterChildren.map(({ id, raceEntryId: _raceEntryId, horseId: _horseId,
          jockeyId: _jockeyId, trainerId: _trainerId, ...other }) => [id, other])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
      });
      if (immutableBefore !== immutableAfter || afterParents.length !== 12 || afterChildren.length !== 177
        || afterParents.filter((p) => p.raceId).length !== 12
        || afterChildren.filter((c) => c.raceEntryId).length !== 177
        || afterChildren.filter((c) => c.horseId).length !== 177
        || afterChildren.filter((c) => c.jockeyId).length !== 30
        || afterChildren.some((c) => c.trainerId !== null)) {
        throw new Error("Post-update link or immutable-field invariant failed");
      }
    }
    return { mode: dryRun ? "dry_run" : "save", environment, raceDate, venue: "hanshin",
      parent: plan.parent, child: plan.child,
      final: save ? { parent: 12, child: 177, raceLinks: 12,
        raceEntryLinks: 177, horseLinks: 177, jockeyLinks: 30, trainerLinks: 0 } : null };
  });
}

run().then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    const allowed = [
      "Snapshot parent precondition failed",
      "Target date row-count precondition failed",
      "Strict identity resolution did not match the approved counts",
      "Parent link changed concurrently",
      "Child link changed concurrently",
      "Post-update link or immutable-field invariant failed",
      "Snapshot parent/child scope mismatch",
      "Snapshot child count or horse number invariant failed",
    ];
    console.error(error instanceof Error && allowed.includes(error.message)
      ? error.message : "Backfill failed without exposing connection details");
    process.exitCode = 1;
  });
