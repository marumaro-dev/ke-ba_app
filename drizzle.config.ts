import { defineConfig } from "drizzle-kit";
import { z } from "zod";

import { loadLocalEnv } from "./src/lib/load-env";

loadLocalEnv();

const databaseUrlResult = z.string().url().safeParse(process.env.DATABASE_URL);

if (!databaseUrlResult.success) {
  throw new Error(
    [
      "DATABASE_URL is required for Drizzle migrations.",
      "Set it in .env.local or in the command execution environment.",
      "Use a postgresql:// connection string from Supabase and include sslmode=require.",
    ].join("\n"),
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrlResult.data,
  },
  strict: true,
  verbose: true,
});
