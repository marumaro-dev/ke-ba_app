import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { evaluatePredictions } from "@/features/predictions/evaluator";
import { loadLocalEnv } from "@/lib/load-env";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const predictionRunId = getArgValue("--prediction-run-id");

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to evaluate predictions.");
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});
const db = drizzle(client);

evaluatePredictions({ db, dryRun, predictionRunId })
  .then((result) => {
    console.log(
      [
        `Prediction evaluation ${dryRun ? "dry-run" : "completed"}.`,
        `evaluated_at: ${result.evaluatedAt.toISOString()}`,
        `target_runs: ${result.targetRuns}`,
        `target_predictions: ${result.targetPredictions}`,
        `calculated_evaluations: ${result.calculatedEvaluations}`,
        `inserted_evaluations: ${result.insertedEvaluations}`,
        `updated_evaluations: ${result.updatedEvaluations}`,
        `skipped_predictions: ${result.skippedPredictions}`,
        "note: evaluation validates past predictions against race_results; it is not a guarantee.",
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
