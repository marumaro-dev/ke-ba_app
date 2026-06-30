import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { getDatabaseEnv } from "@/lib/env";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const { DATABASE_URL } = getDatabaseEnv();
  const client = postgres(DATABASE_URL, {
    max: 1,
    prepare: false,
  });

  return drizzle(client, { schema });
}

export function getDb() {
  database ??= createDatabase();
  return database;
}
