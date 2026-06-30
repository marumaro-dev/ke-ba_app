import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { phase2FeatureDefinitions } from "@/features/feature-engineering/definitions";
import { loadLocalEnv } from "@/lib/load-env";
import { featureDefinitions } from "./schema";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed feature definitions.");
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});
const db = drizzle(client);

async function seedFeatureDefinitions() {
  for (const definition of phase2FeatureDefinitions) {
    await db
      .insert(featureDefinitions)
      .values({
        id: definition.id,
        featureKey: definition.featureKey,
        name: definition.name,
        description: definition.description,
        entityType: definition.entityType,
        valueType: definition.valueType,
        version: definition.version,
        calculationLogic: definition.calculationLogic,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [featureDefinitions.featureKey, featureDefinitions.version],
        set: {
          name: definition.name,
          description: definition.description,
          entityType: definition.entityType,
          valueType: definition.valueType,
          isActive: true,
          calculationLogic: definition.calculationLogic,
          updatedAt: new Date(),
        },
      });
  }

  const activeCount = await db
    .select({ id: featureDefinitions.id })
    .from(featureDefinitions)
    .where(eq(featureDefinitions.isActive, true));

  console.log(`Feature definitions seeded. active=${activeCount.length}`);
}

seedFeatureDefinitions()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
