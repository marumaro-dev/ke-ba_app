import { describe, expect, it } from "vitest";

import { planPreRaceLinkBackfill, type LinkChild, type LinkParent } from "./backfill";

const parent: LinkParent = {
  id: "snapshot", raceDate: "2027-02-01", venue: "架空場", raceNumber: 1,
  declaredEntries: 2, raceId: null,
};
const children: LinkChild[] = [
  { id: "one", preRaceSnapshotId: "snapshot", horseNumber: 1,
    horseNameRaw: "架空馬甲", jockeyNameRaw: "架空騎手甲", rawHorseNumberMarker: "*",
    raceEntryId: null, horseId: null, jockeyId: null, trainerId: null },
  { id: "two", preRaceSnapshotId: "snapshot", horseNumber: 2,
    horseNameRaw: "架空馬乙", jockeyNameRaw: "架空騎手", rawHorseNumberMarker: null,
    raceEntryId: null, horseId: null, jockeyId: null, trainerId: null },
];
const reader = {
  async resolveRace() { return { id: "race" }; },
  async resolveRaceEntry(_raceId: string, horseNumber: number) {
    return horseNumber === 1
      ? { id: "entry-one", horse: { id: "horse-one", displayName: "*架空馬甲" },
        jockey: { id: "jockey-one", displayName: "架空騎手甲" }, trainer: null }
      : { id: "entry-two", horse: { id: "horse-two", displayName: "架空馬乙" },
        jockey: { id: "jockey-two", displayName: "架空騎手乙" }, trainer: null };
  },
};

describe("planPreRaceLinkBackfill", () => {
  it("plans strict horse links and leaves a shortened jockey name unresolved", async () => {
    const plan = await planPreRaceLinkBackfill([parent], children, reader);
    expect(plan.parent).toMatchObject({ target: 1, resolved: 1, wouldUpdate: 1, conflict: 0 });
    expect(plan.child).toMatchObject({ target: 2, raceEntryResolved: 2,
      horseResolved: 2, jockeyResolved: 1, trainerResolved: 0,
      wouldUpdate: 2, unresolved: 1, conflict: 0 });
    expect(plan.childUpdates[1]).toMatchObject({ raceEntryId: "entry-two",
      horseId: "horse-two", jockeyId: null });
  });

  it("does not overwrite a conflicting existing ID", async () => {
    const plan = await planPreRaceLinkBackfill(
      [{ ...parent, raceId: "another-race" }],
      [{ ...children[0], raceEntryId: "another-entry" }, children[1]], reader,
    );
    expect(plan.parent.conflict).toBe(1);
    expect(plan.child.conflict).toBe(1);
    expect(plan.childUpdates).toHaveLength(1);
  });

  it("accepts already-linked IDs without planning an overwrite", async () => {
    const plan = await planPreRaceLinkBackfill(
      [{ ...parent, raceId: "race" }],
      [{ ...children[0], raceEntryId: "entry-one", horseId: "horse-one", jockeyId: "jockey-one" },
        children[1]], reader,
    );
    expect(plan.parent).toMatchObject({ alreadyLinked: 1, wouldUpdate: 0, conflict: 0 });
    expect(plan.childUpdates).toHaveLength(1);
    expect(plan.child.conflict).toBe(0);
  });

  it("rejects mismatched counts and duplicate horse numbers", async () => {
    await expect(planPreRaceLinkBackfill([parent], children.slice(0, 1), reader)).rejects.toThrow();
    await expect(planPreRaceLinkBackfill([parent],
      [children[0], { ...children[1], horseNumber: 1 }], reader)).rejects.toThrow();
  });

  it("will not link a horse on prefix-only similarity", async () => {
    const altered = [{ ...children[0], horseNameRaw: "架空馬" }, children[1]];
    const plan = await planPreRaceLinkBackfill([parent], altered, reader);
    expect(plan.child.raceEntryResolved).toBe(1);
    expect(plan.child.horseResolved).toBe(1);
  });
});
