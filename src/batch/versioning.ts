import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const bundleFiles = [
  "races.sample.csv", "horses.sample.csv", "jockeys.sample.csv",
  "trainers.sample.csv", "race_entries.sample.csv", "race_results.sample.csv",
] as const;

export async function bundleChecksum(directory: string): Promise<string> {
  const digest = createHash("sha256");
  for (const file of bundleFiles) {
    const data = await readFile(path.join(directory, file));
    digest.update(`${file}:${data.byteLength}:`, "utf8").update(data);
  }
  return digest.digest("hex");
}

export async function selectBundleVersion(baseDir: string, candidateChecksum: string) {
  let versionDirectories: string[];
  try {
    versionDirectories = (await readdir(baseDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^v\d{3,}$/.test(entry.name))
      .map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    versionDirectories = [];
  }
  for (const version of versionDirectories) {
    if (await bundleChecksum(path.join(baseDir, version)) === candidateChecksum) {
      return { status: "existing_same" as const, version, directory: path.join(baseDir, version) };
    }
  }
  const next = Math.max(0, ...versionDirectories.map((name) => Number(name.slice(1)))) + 1;
  const version = `v${String(next).padStart(3, "0")}`;
  return { status: "new_version" as const, version, directory: path.join(baseDir, version) };
}
