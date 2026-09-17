import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { planPreRaceLinkBackfill, type LinkChild, type LinkParent } from "../pre-race-snapshots/backfill";
import type { getDb } from "./index";
import { createPreRaceSnapshotRepository } from "./pre-race-snapshot-repository";
import { preRaceEntrySnapshots, preRaceSnapshots } from "./schema";

type Database = ReturnType<typeof getDb>;

/** One venue/day, one transaction; no write path is reachable in dry-run. */
export async function backfillPreRaceLinks(input: {
  db: Database;
  date: string;
  venue: string;
  mode: "dry_run" | "apply";
  expectedRaces: number;
  expectedEntries: number;
}) {
  return input.db.transaction(async (tx) => {
    if (input.mode === "dry_run") await tx.execute(sql`set transaction read only`);
    const parents = await tx.select().from(preRaceSnapshots).where(and(
      eq(preRaceSnapshots.raceDate, input.date), eq(preRaceSnapshots.venue, input.venue),
    ));
    if (parents.length !== input.expectedRaces) throw new Error("snapshot_parent_count_mismatch");
    const children = await tx.select().from(preRaceEntrySnapshots).where(
      inArray(preRaceEntrySnapshots.preRaceSnapshotId, parents.map((p) => p.id)),
    );
    if (children.length !== input.expectedEntries) throw new Error("snapshot_child_count_mismatch");
    const reader = createPreRaceSnapshotRepository(tx as unknown as Database);
    const plan = await planPreRaceLinkBackfill(parents as LinkParent[], children.map((c): LinkChild => ({
      id: c.id, preRaceSnapshotId: c.preRaceSnapshotId,
      horseNumber: c.horseNumber, horseNameRaw: c.horseNameRaw,
      jockeyNameRaw: c.jockeyNameRaw,
      rawHorseNumberMarker: c.rawFieldsJson.horseNumberMarker,
      raceEntryId: c.raceEntryId, horseId: c.horseId,
      jockeyId: c.jockeyId, trainerId: c.trainerId,
    })), reader);
    if (plan.parent.conflict || plan.child.conflict
      || plan.parent.resolved !== input.expectedRaces
      || plan.child.raceEntryResolved !== input.expectedEntries
      || plan.child.horseResolved !== input.expectedEntries
      || plan.child.trainerResolved !== 0) {
      throw new Error("safe_link_resolution_conflict");
    }
    if (input.mode === "apply") {
      const immutableBefore = immutableView(parents, children);
      for (const update of plan.parentUpdates) {
        const rows = await tx.update(preRaceSnapshots).set({ raceId: update.raceId })
          .where(and(eq(preRaceSnapshots.id, update.id), isNull(preRaceSnapshots.raceId)))
          .returning({ id: preRaceSnapshots.id });
        if (rows.length !== 1) throw new Error("concurrent_parent_link_change");
      }
      for (const update of plan.childUpdates) {
        const rows = await tx.update(preRaceEntrySnapshots).set({
          raceEntryId: update.raceEntryId, horseId: update.horseId,
          jockeyId: update.jockeyId,
        }).where(and(eq(preRaceEntrySnapshots.id, update.id),
          update.previousRaceEntryId === null ? isNull(preRaceEntrySnapshots.raceEntryId)
            : eq(preRaceEntrySnapshots.raceEntryId, update.previousRaceEntryId),
          update.previousHorseId === null ? isNull(preRaceEntrySnapshots.horseId)
            : eq(preRaceEntrySnapshots.horseId, update.previousHorseId),
          update.previousJockeyId === null ? isNull(preRaceEntrySnapshots.jockeyId)
            : eq(preRaceEntrySnapshots.jockeyId, update.previousJockeyId)))
          .returning({ id: preRaceEntrySnapshots.id });
        if (rows.length !== 1) throw new Error("concurrent_child_link_change");
      }
      const afterParents = await tx.select().from(preRaceSnapshots).where(and(
        eq(preRaceSnapshots.raceDate, input.date), eq(preRaceSnapshots.venue, input.venue),
      ));
      const afterChildren = await tx.select().from(preRaceEntrySnapshots).where(
        inArray(preRaceEntrySnapshots.preRaceSnapshotId, parents.map((p) => p.id)),
      );
      if (immutableView(afterParents, afterChildren) !== immutableBefore
        || afterParents.filter((p) => p.raceId).length !== input.expectedRaces
        || afterChildren.filter((c) => c.raceEntryId).length !== input.expectedEntries
        || afterChildren.filter((c) => c.horseId).length !== input.expectedEntries
        || afterChildren.filter((c) => c.jockeyId).length !== plan.child.jockeyResolved
        || afterChildren.some((c) => c.trainerId !== null)) {
        throw new Error("backfill_postcondition_failed");
      }
    }
    return {
      races: plan.parent.resolved,
      raceEntries: plan.child.raceEntryResolved,
      horses: plan.child.horseResolved,
      jockeys: plan.child.jockeyResolved,
      trainers: plan.child.trainerResolved,
      wouldUpdateParents: plan.parent.wouldUpdate,
      wouldUpdateChildren: plan.child.wouldUpdate,
    };
  });
}

function immutableView(
  parents: Array<typeof preRaceSnapshots.$inferSelect>,
  children: Array<typeof preRaceEntrySnapshots.$inferSelect>,
) {
  const a = parents.map(({ id, raceId: _raceId, ...other }) => [id, other])
    .sort(([aId], [bId]) => String(aId).localeCompare(String(bId)));
  const b = children.map(({ id, raceEntryId: _entry, horseId: _horse,
    jockeyId: _jockey, ...other }) => [id, other])
    .sort(([aId], [bId]) => String(aId).localeCompare(String(bId)));
  return JSON.stringify({ parents: a, children: b });
}
