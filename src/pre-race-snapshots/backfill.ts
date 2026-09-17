import type { SnapshotReader } from "./save";
import { matchesSnapshotHorseName, matchesSnapshotJockeyName } from "./identity-match";

export type LinkParent = {
  id: string;
  raceDate: string;
  venue: string;
  raceNumber: number;
  declaredEntries: number;
  raceId: string | null;
};

export type LinkChild = {
  id: string;
  preRaceSnapshotId: string;
  horseNumber: number;
  horseNameRaw: string;
  jockeyNameRaw: string;
  rawHorseNumberMarker: string | null;
  raceEntryId: string | null;
  horseId: string | null;
  jockeyId: string | null;
  trainerId: string | null;
};

export type ParentLinkUpdate = { id: string; raceId: string };
export type ChildLinkUpdate = {
  id: string;
  raceEntryId: string | null;
  horseId: string | null;
  jockeyId: string | null;
  previousRaceEntryId: string | null;
  previousHorseId: string | null;
  previousJockeyId: string | null;
};

export type LinkPlan = {
  parent: {
    target: number;
    resolved: number;
    wouldUpdate: number;
    alreadyLinked: number;
    unresolved: number;
    conflict: number;
  };
  child: {
    target: number;
    raceEntryResolved: number;
    horseResolved: number;
    jockeyResolved: number;
    trainerResolved: number;
    wouldUpdate: number;
    unresolved: number;
    conflict: number;
  };
  parentUpdates: ParentLinkUpdate[];
  childUpdates: ChildLinkUpdate[];
};

/** Computes an update plan without writing or guessing from partial names. */
export async function planPreRaceLinkBackfill(
  parents: LinkParent[],
  children: LinkChild[],
  reader: Pick<SnapshotReader, "resolveRace" | "resolveRaceEntry">,
): Promise<LinkPlan> {
  const plan: LinkPlan = {
    parent: { target: parents.length, resolved: 0, wouldUpdate: 0, alreadyLinked: 0, unresolved: 0, conflict: 0 },
    child: { target: children.length, raceEntryResolved: 0, horseResolved: 0, jockeyResolved: 0, trainerResolved: 0, wouldUpdate: 0, unresolved: 0, conflict: 0 },
    parentUpdates: [], childUpdates: [],
  };
  const byParent = new Map<string, LinkChild[]>();
  for (const child of children) {
    if (!byParent.has(child.preRaceSnapshotId)) byParent.set(child.preRaceSnapshotId, []);
    byParent.get(child.preRaceSnapshotId)!.push(child);
  }
  if (byParent.size !== parents.length || parents.some((p) => !byParent.has(p.id))) {
    throw new Error("Snapshot parent/child scope mismatch");
  }

  for (const parent of parents) {
    const entries = byParent.get(parent.id)!;
    if (entries.length !== parent.declaredEntries
      || new Set(entries.map((entry) => entry.horseNumber)).size !== entries.length) {
      throw new Error("Snapshot child count or horse number invariant failed");
    }
    const race = await reader.resolveRace({
      raceDate: parent.raceDate,
      venue: parent.venue,
      raceNumber: parent.raceNumber,
    });
    if (!race) {
      plan.parent.unresolved++;
    } else {
      plan.parent.resolved++;
      if (parent.raceId && parent.raceId !== race.id) plan.parent.conflict++;
      else if (parent.raceId === race.id) plan.parent.alreadyLinked++;
      else plan.parentUpdates.push({ id: parent.id, raceId: race.id });
    }

    for (const child of entries) {
      const candidate = race ? await reader.resolveRaceEntry(race.id, child.horseNumber) : null;
      const matched = candidate && matchesSnapshotHorseName(
        child.horseNameRaw, child.rawHorseNumberMarker, candidate.horse?.displayName ?? null,
      ) ? candidate : null;
      const raceEntryId = matched?.id ?? null;
      const horseId = matched?.horse?.id ?? null;
      const jockeyId = matched && matchesSnapshotJockeyName(
        child.jockeyNameRaw, matched.jockey?.displayName ?? null,
      ) ? matched.jockey!.id : null;

      if (raceEntryId) plan.child.raceEntryResolved++;
      if (horseId) plan.child.horseResolved++;
      if (jockeyId) plan.child.jockeyResolved++;
      if (child.trainerId) plan.child.trainerResolved++;
      if (!raceEntryId || !horseId || !jockeyId) plan.child.unresolved++;

      if ((child.raceEntryId && child.raceEntryId !== raceEntryId)
        || (child.horseId && child.horseId !== horseId)
        || (child.jockeyId && child.jockeyId !== jockeyId)
        || child.trainerId) {
        plan.child.conflict++;
        continue;
      }
      if ((raceEntryId && !child.raceEntryId) || (horseId && !child.horseId)
        || (jockeyId && !child.jockeyId)) {
        plan.childUpdates.push({ id: child.id, raceEntryId, horseId, jockeyId,
          previousRaceEntryId: child.raceEntryId,
          previousHorseId: child.horseId,
          previousJockeyId: child.jockeyId });
      }
    }
  }
  plan.parent.wouldUpdate = plan.parentUpdates.length;
  plan.child.wouldUpdate = plan.childUpdates.length;
  return plan;
}
