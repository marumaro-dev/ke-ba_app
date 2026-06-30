import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { generateP0Features } from "@/features/feature-engineering/generator";
import { loadLocalEnv } from "@/lib/load-env";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const asOfAt = parseAsOfAt(getArgValue("--as-of-at"));

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to generate features.");
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});
const db = drizzle(client);

generateP0Features({ db, asOfAt, dryRun })
  .then((result) => {
    console.log(
      [
        `Feature generation ${result.mode === "dry_run" ? "dry-run" : "completed"}.`,
        `Batch: ${result.batchId}`,
        `as_of_at: ${result.asOfAt.toISOString()}`,
        `target_entries: ${result.targetEntries}`,
        `calculated_snapshots: ${result.calculatedSnapshots}`,
        `inserted_snapshots: ${result.insertedSnapshots}`,
        `updated_snapshots: ${result.updatedSnapshots}`,
      ].join("\n"),
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });

function getArgValue(name: string) {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseAsOfAt(value: string | undefined) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("--as-of-at must be a valid ISO 8601 datetime.");
  }

  return parsed;
}
