import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverTargetDays } from "./discover";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function root() {
  const value = await mkdtemp(path.join(os.tmpdir(), "synthetic-target-discover-"));
  roots.push(value);
  return value;
}

async function add(rootDir: string, date: string, venue: string,
  kind: "entries" | "results") {
  const directory = path.join(rootDir, date.slice(0, 4), date, venue, kind);
  await mkdir(directory, { recursive: true });
  const prefix = kind === "entries" ? "target_entries" : "target_results";
  await writeFile(path.join(directory, `${prefix}_${date}_${venue}.txt`), "架空データ", "utf8");
}

describe("TARGET day discovery", () => {
  it("finds complete and incomplete dates and applies date/venue filters", async () => {
    const directory = await root();
    for (const date of ["2027-02-01", "2027-02-02"]) {
      await add(directory, date, "hanshin", "entries");
      await add(directory, date, "hanshin", "results");
    }
    await add(directory, "2027-02-03", "tokyo", "entries");
    const all = await discoverTargetDays(directory);
    expect(all.map((item) => item.status)).toEqual(["complete", "complete", "incomplete"]);
    expect(await discoverTargetDays(directory, { from: "2027-02-02", to: "2027-02-03",
      venue: "hanshin" })).toHaveLength(1);
  });

  it("does not silently skip a results-only directory", async () => {
    const directory = await root();
    await add(directory, "2027-02-01", "hanshin", "results");
    expect((await discoverTargetDays(directory))[0]).toMatchObject({
      status: "incomplete", entriesFile: null,
    });
  });
});
