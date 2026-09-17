import { readdir } from "node:fs/promises";
import path from "node:path";

export type DailyCandidate = {
  date: string;
  venueCode: string;
  entriesFile: string | null;
  resultsFile: string | null;
  status: "complete" | "incomplete";
};

export type DailyFilters = { from?: string; to?: string; venue?: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const venuePattern = /^[a-z][a-z0-9_]*$/;

export async function discoverTargetDays(root: string, filters: DailyFilters = {}): Promise<DailyCandidate[]> {
  if ((filters.from && !datePattern.test(filters.from)) || (filters.to && !datePattern.test(filters.to))
    || (filters.venue && !venuePattern.test(filters.venue))
    || (filters.from && filters.to && filters.from > filters.to)) {
    throw new Error("Invalid date or venue filter");
  }
  const output: DailyCandidate[] = [];
  for (const year of await directories(root)) {
    if (!/^\d{4}$/.test(year)) continue;
    for (const date of await directories(path.join(root, year))) {
      if (!datePattern.test(date) || !date.startsWith(`${year}-`)
        || (filters.from && date < filters.from) || (filters.to && date > filters.to)) continue;
      for (const venueCode of await directories(path.join(root, year, date))) {
        if (!venuePattern.test(venueCode) || (filters.venue && venueCode !== filters.venue)) continue;
        const dayDir = path.join(root, year, date, venueCode);
        const entriesFile = await fileIn(path.join(dayDir, "entries"), `target_entries_${date}_${venueCode}.txt`);
        const resultsFile = await fileIn(path.join(dayDir, "results"), `target_results_${date}_${venueCode}.txt`);
        output.push({ date, venueCode, entriesFile, resultsFile,
          status: entriesFile && resultsFile ? "complete" : "incomplete" });
      }
    }
  }
  return output.sort((a, b) => a.date.localeCompare(b.date) || a.venueCode.localeCompare(b.venueCode));
}

async function directories(parent: string): Promise<string[]> {
  return (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function fileIn(parent: string, expected: string): Promise<string | null> {
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name === expected)
      ? path.join(parent, expected) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
