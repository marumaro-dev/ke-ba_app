import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { discoverTargetDays } from "./discover";
import { assertBatchConnection, assertProductionGitState, parseBatchExecution } from "./execution-guard";
import { verifyProductionMigrationHistory } from "./migration-guard";
import { processTargetDays } from "./pipeline";
import { createBatchAdapter } from "./preview-adapter";

const args = process.argv.slice(2);
const execution = parseBatchExecution(args);
const { mode, environment } = execution;
const rawRoot = path.resolve(value("--raw-root"));
const filters = execution.filters;

async function main() {
  const candidates = await discoverTargetDays(rawRoot, filters);
  if (mode === "--scan") {
    console.log(JSON.stringify({ discovered: candidates.length,
      complete: candidates.filter((day) => day.status === "complete").length,
      incomplete: candidates.filter((day) => day.status === "incomplete").length,
      days: candidates.map(({ date, venueCode, status }) => ({ date, venue: venueCode, status })) }));
    return;
  }
  if (environment === "production" && candidates.length !== 1) {
    throw new Error("Production requires exactly one complete target day");
  }
  assertBatchConnection({ environment, appEnv: process.env.APP_ENV,
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    execArgv: process.execArgv, cwd: process.cwd() });
  if (environment === "production" && mode === "--apply") {
    assertProductionGitState(
      execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }),
      execFileSync("git", ["status", "--porcelain=v1"], { encoding: "utf8" }),
    );
  }
  const csvRoot = path.resolve(value("--csv-root"));
  if (withinRepository(rawRoot) || withinRepository(csvRoot)) {
    throw new Error("Raw TARGET and generated bundles must remain outside this repository");
  }
  if (optional("--csv-as-of-at-map") !== undefined) {
    throw new Error("--csv-as-of-at-map is unsafe; use --source-times-map with separately verified times");
  }
  const mapFile = optional("--source-times-map");
  const parsed: unknown = mapFile ? JSON.parse(await readFile(path.resolve(mapFile), "utf8")) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.values(parsed).some((item) => !item || typeof item !== "object"
      || Array.isArray(item) || Object.keys(item).some((key) => !["availableAt", "observedAt"].includes(key))
      || Object.values(item).some((value) => typeof value !== "string"))) {
    throw new Error("Source times map must provide separately verified availableAt/observedAt strings");
  }
  if (environment === "production") {
    const migrationCount = await verifyProductionMigrationHistory(process.env.DATABASE_URL!);
    console.log(JSON.stringify({ environment, connectionVerified: true, migrationCount }));
  }
  const adapter = createBatchAdapter({ csvRoot, environment,
    bundleVersion: execution.bundleVersion,
    sourceTimesByDay: parsed as Record<string, { availableAt?: string; observedAt?: string }>,
    databaseUrl: process.env.DATABASE_URL! });
  try {
    if (environment === "production") {
      const preflight = await processTargetDays(candidates, "dry_run", adapter.operations);
      console.log(JSON.stringify({ environment, preflight }));
      if (preflight.days.length !== 1 || preflight.days[0].status !== "planned"
        || preflight.totals.failed || preflight.totals.incomplete
        || preflight.days[0].errors.length) {
        throw new Error("Production preflight failed");
      }
      if (mode === "--dry-run") return;
      if (preflight.days[0].warnings.includes("timestamp_contract_only")) {
        throw new Error("Production timestamp correction requires a separate operation");
      }
      if (preflight.days[0].warnings.includes("existing_same")) {
        console.log(JSON.stringify({ environment, status: "skipped_same", writes: 0 }));
        return;
      }
    }
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

main().catch(() => {
  console.error("Target batch stopped; inspect inputs and selected environment without exposing secrets");
  process.exitCode = 1;
});
