import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { bundleChecksum, bundleFiles, selectBundleVersion } from "./versioning";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function writeBundle(directory: string, marker: string) {
  await mkdir(directory, { recursive: true });
  for (const file of bundleFiles) await writeFile(path.join(directory, file), `${file}:${marker}`, "utf8");
}

describe("immutable bundle version selection", () => {
  it("reuses identical content and allocates a new version for changed content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "synthetic-target-versions-"));
    roots.push(root);
    await writeBundle(path.join(root, "v001"), "first");
    const candidate = path.join(root, "candidate");
    await writeBundle(candidate, "first");
    expect(await selectBundleVersion(root, await bundleChecksum(candidate)))
      .toMatchObject({ status: "existing_same", version: "v001" });
    await writeBundle(candidate, "changed");
    expect(await selectBundleVersion(root, await bundleChecksum(candidate)))
      .toMatchObject({ status: "new_version", version: "v002" });
  });
});
