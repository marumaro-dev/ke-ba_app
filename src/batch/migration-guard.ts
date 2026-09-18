import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

type MigrationRow = { hash: string; created_at: string | number };
type ExpectedMigration = { hash: string; when: number };

export function assertMigrationRows(actual: MigrationRow[], expected: ExpectedMigration[]) {
  if (actual.length !== expected.length || actual.some((row, index) =>
    row.hash !== expected[index].hash || Number(row.created_at) !== expected[index].when)) {
    throw new Error("Production migration history mismatch");
  }
  return expected.length;
}

/** Exact local journal/SQL hash match; the database transaction cannot write. */
export async function verifyProductionMigrationHistory(databaseUrl: string) {
  const root = path.resolve(process.cwd(), "drizzle");
  const journal = JSON.parse(await readFile(path.join(root, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
  if (journal.entries.length !== 7 || journal.entries.some((entry, index) =>
    entry.idx !== index || !entry.tag.startsWith(`000${index}_`))) {
    throw new Error("Local migration journal mismatch");
  }
  const expected = await Promise.all(journal.entries.map(async (entry) => ({
    hash: createHash("sha256").update(await readFile(path.join(root, `${entry.tag}.sql`)))
      .digest("hex"),
    when: entry.when,
  })));
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const actual = await client.begin(async (tx) => {
      await tx`SET TRANSACTION READ ONLY`;
      return tx<MigrationRow[]>`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    });
    return assertMigrationRows(actual, expected);
  } finally {
    await client.end();
  }
}
