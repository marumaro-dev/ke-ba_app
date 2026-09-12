import {
  and,
  asc,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import {
  predictionEvaluations,
  predictionRuns,
  racePredictions,
} from "@/db/schema";
import { calculatePredictionAnalytics } from "@/features/predictions/analytics";
import {
  parsePredictionAnalyticsSearchParams,
  type PredictionAnalyticsSearchParams,
} from "@/features/predictions/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const diagnosticTimeoutMs = 9_000;

type DiagnosticStatus =
  | "ok"
  | "timeout"
  | "relation_missing"
  | "unknown_error";

type StageDiagnostic<T extends object> = {
  status: DiagnosticStatus;
  elapsedMs: number;
  result?: T;
};

// Temporary Preview-only diagnostic route. Remove it after the analytics page
// timeout has been identified. Each database stage owns and closes a disposable
// Drizzle/postgres.js client so a timed-out query cannot block the shared client.
// Responses never include row contents, connection details, filters, or errors.
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const startedAt = performance.now();
  const filters = parsePredictionAnalyticsSearchParams(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  const countQuery = await runDatabaseStage(async (db) => {
    const conditions = buildConditions(filters);
    const rows = await db
      .select({ value: count() })
      .from(racePredictions)
      .innerJoin(
        predictionRuns,
        eq(racePredictions.predictionRunId, predictionRuns.id),
      )
      .leftJoin(
        predictionEvaluations,
        eq(racePredictions.id, predictionEvaluations.racePredictionId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return { count: rows[0]?.value ?? 0 };
  });

  const predictionEvaluationJoinQuery = await runDatabaseStage(async (db) => {
    const rows = await selectAnalyticsRows(db, filters);

    return { rowCount: rows.length };
  });

  const modelVersionDistinctQuery = await runDatabaseStage(async (db) => {
    const rows = await selectModelVersions(db);

    return { rowCount: rows.length };
  });

  const analyticsAggregation = await runDatabaseStage(async (db) => {
    const rows = await selectAnalyticsRows(db, filters);
    calculatePredictionAnalytics(rows);

    return { rowCount: rows.length, aggregationCompleted: true };
  });

  const pageEquivalent = await runDatabaseStage(async (db) => {
    // Match getPredictionAnalytics(): submit both SQL statements together, then
    // perform the same in-memory aggregation. This client is isolated from the
    // application singleton and is always closed after this stage.
    const [rows, modelVersions] = await Promise.all([
      selectAnalyticsRows(db, filters),
      selectModelVersions(db),
    ]);
    calculatePredictionAnalytics(rows);

    return {
      rowCount: rows.length,
      modelVersionCount: modelVersions.length,
      aggregationCompleted: true,
    };
  });

  const stages = {
    countQuery,
    predictionEvaluationJoinQuery,
    modelVersionDistinctQuery,
    analyticsAggregation,
    pageEquivalent,
  };
  const failedStage = Object.entries(stages).find(
    ([, stage]) => stage.status !== "ok",
  );
  const overall = failedStage?.[1].status ?? "ok";

  return Response.json(
    {
      appEnv: normalizeEnvironment(process.env.APP_ENV),
      vercelEnv: normalizeEnvironment(process.env.VERCEL_ENV),
      clientKind: "disposable-drizzle",
      timeoutMsPerStage: diagnosticTimeoutMs,
      overall,
      firstFailedStage: failedStage?.[0] ?? null,
      stages,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
    {
      status: overall === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function createDiagnosticDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 5,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}

type DiagnosticDatabase = ReturnType<typeof createDiagnosticDatabase>["db"];

async function selectAnalyticsRows(
  db: DiagnosticDatabase,
  filters: PredictionAnalyticsSearchParams,
) {
  const conditions = buildConditions(filters);

  return db
    .select({
      predictionRunId: predictionRuns.id,
      modelVersion: predictionRuns.modelVersion,
      raceId: racePredictions.raceId,
      racePredictionId: racePredictions.id,
      rankInRace: racePredictions.rankInRace,
      rankDiff: predictionEvaluations.rankDiff,
      isPredictedTop1: predictionEvaluations.isPredictedTop1,
      topPredictionIsTop3: predictionEvaluations.topPredictionIsTop3,
      actualWinnerInPredictedTop3:
        predictionEvaluations.actualWinnerInPredictedTop3,
      scoreComponentsJson: racePredictions.scoreComponentsJson,
    })
    .from(racePredictions)
    .innerJoin(
      predictionRuns,
      eq(racePredictions.predictionRunId, predictionRuns.id),
    )
    .leftJoin(
      predictionEvaluations,
      eq(racePredictions.id, predictionEvaluations.racePredictionId),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      asc(predictionRuns.modelVersion),
      asc(racePredictions.raceId),
      asc(racePredictions.rankInRace),
    );
}

function selectModelVersions(db: DiagnosticDatabase) {
  return db
    .selectDistinct({ modelVersion: predictionRuns.modelVersion })
    .from(predictionRuns)
    .orderBy(asc(predictionRuns.modelVersion));
}

function buildConditions(filters: PredictionAnalyticsSearchParams): SQL[] {
  const conditions: SQL[] = [];

  if (filters.modelVersion !== "all") {
    conditions.push(eq(predictionRuns.modelVersion, filters.modelVersion));
  }

  if (filters.asOfDate) {
    const from = new Date(`${filters.asOfDate}T00:00:00+09:00`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    conditions.push(gte(predictionRuns.asOfAt, from));
    conditions.push(lt(predictionRuns.asOfAt, to));
  }

  if (filters.evaluationStatus === "evaluated") {
    conditions.push(isNotNull(predictionEvaluations.id));
  } else if (filters.evaluationStatus === "unevaluated") {
    conditions.push(isNull(predictionEvaluations.id));
  }

  return conditions;
}

async function runDatabaseStage<T extends object>(
  operation: (db: DiagnosticDatabase) => Promise<T>,
): Promise<StageDiagnostic<T>> {
  const startedAt = performance.now();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      status: "unknown_error",
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const { client, db } = createDiagnosticDatabase(databaseUrl);

  try {
    const result = await withTimeout(operation(db), diagnosticTimeoutMs);

    return {
      status: "ok",
      elapsedMs: Math.round(performance.now() - startedAt),
      result,
    };
  } catch (error: unknown) {
    return {
      status: classifyError(error),
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

function classifyError(error: unknown): DiagnosticStatus {
  if (error instanceof DiagnosticTimeoutError) {
    return "timeout";
  }

  const code = getErrorCode(error);

  if (code === "42P01") {
    return "relation_missing";
  }

  if (
    code === "CONNECT_TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "57014"
  ) {
    return "timeout";
  }

  return "unknown_error";
}

function normalizeEnvironment(value: string | undefined) {
  return value === "development" || value === "preview" || value === "production"
    ? value
    : "unknown";
}

function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new DiagnosticTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

class DiagnosticTimeoutError extends Error {}
