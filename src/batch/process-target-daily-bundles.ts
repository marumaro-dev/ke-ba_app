import { readFile } from "node:fs/promises";
import path from "node:path";

import { discoverTargetDays } from "./discover";
import { processTargetDays } from "./pipeline";
import { createPreviewBatchAdapter } from "./preview-adapter";

const args = process.argv.slice(2);
const modes = ["--scan", "--dry-run", "--apply"].filter((mode) => args.includes(mode));
if (modes.length !== 1) throw new Error("Exactly one of --scan, --dry-run, --apply is required");
const mode = modes[0];
const rawRoot = path.resolve(value("--raw-root"));
const filters = { from: optional("--from"), to: optional("--to"), venue: optional("--venue") };

async function main() {
  const candidates = await discoverTargetDays(rawRoot, filters);
  if (mode === "--scan") {
    console.log(JSON.stringify({ discovered: candidates.length,
      complete: candidates.filter((day) => day.status === "complete").length,
      incomplete: candidates.filter((day) => day.status === "incomplete").length,
      days: candidates.map(({ date, venueCode, status }) => ({ date, venue: venueCode, status })) }));
    return;
  }
  assertPreviewConnection();
  const csvRoot = path.resolve(value("--csv-root"));
  if (withinRepository(rawRoot) || withinRepository(csvRoot)) {
    throw new Error("Raw TARGET and generated bundles must remain outside this repository");
  }
  const mapPath = path.resolve(value("--csv-as-of-at-map"));
  const parsed: unknown = JSON.parse(await readFile(mapPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.values(parsed).some((item) => typeof item !== "string")) {
    throw new Error("CSV as-of-at map must be an object of explicitly supplied strings");
  }
  const adapter = createPreviewBatchAdapter({ csvRoot,
    asOfAtByDay: parsed as Record<string, string>, databaseUrl: process.env.DATABASE_URL! });
  try {
    const report = await processTargetDays(candidates,
      mode === "--apply" ? "apply" : "dry_run", adapter.operations);
    console.log(JSON.stringify(report));
    if (report.totals.failed) process.exitCode = 1;
  } finally {
    await adapter.close();
  }
}

function optional(name: string): string | undefined {
  const inline = args.find((arg) => arg.includes("=") && arg.split("=")[0] === name);
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function value(name: string): string {
  const result = optional(name);
  if (!result || result.startsWith("--")) throw new Error(`${name} is required`);
  return result;
}

function withinRepository(location: string): boolean {
  const relative = path.relative(process.cwd(), location);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertPreviewConnection() {
  if (process.env.APP_ENV !== "preview" || !process.env.DATABASE_URL
    || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Preview environment is required");
  const db = new URL(process.env.DATABASE_URL);
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const ref = api.hostname.split(".")[0];
  if (!["postgres:", "postgresql:"].includes(db.protocol)
    || !db.hostname.includes("pooler.supabase.com")
    || db.searchParams.get("sslmode") !== "require"
    || !db.username.endsWith(`.${ref}`)) {
    throw new Error("Preview connection identity check failed");
  }
}

main().catch(() => {
  console.error("Target batch stopped; inspect inputs and Preview state without exposing data or secrets");
  process.exitCode = 1;
});
