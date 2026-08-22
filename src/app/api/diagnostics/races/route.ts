import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { races } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const diagnosticTimeoutMs = 9_000;

type DiagnosticStatus =
  | "ok"
  | "timeout"
  | "relation_missing"
  | "unknown_error";

type QueryDiagnostic<T extends object> = {
  status: DiagnosticStatus;
  elapsedMs: number;
  result?: T;
};

// Temporary Preview-only diagnostic route. Remove it after the /races timeout
// has been identified. It intentionally uses the shared Drizzle client used by
// /races, but never returns row contents, connection details, or raw errors.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const startedAt = performance.now();
  const [countQuery, firstRowQuery] = await Promise.all([
    runQuery(async () => {
      const rows = await getDb().select({ value: count() }).from(races);

      return { count: rows[0]?.value ?? 0 };
    }),
    runQuery(async () => {
      const rows = await getDb().select().from(races).limit(1);

      return { rowFound: rows.length > 0 };
    }),
  ]);
  const overall = combineStatuses(countQuery.status, firstRowQuery.status);

  return Response.json(
    {
      appEnv: normalizeEnvironment(process.env.APP_ENV),
      vercelEnv: normalizeEnvironment(process.env.VERCEL_ENV),
      clientKind: "shared-drizzle",
      timeoutMs: diagnosticTimeoutMs,
      overall,
      countQuery,
      firstRowQuery,
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

async function runQuery<T extends object>(
  query: () => Promise<T>,
): Promise<QueryDiagnostic<T>> {
  const startedAt = performance.now();

  try {
    const result = await withTimeout(query(), diagnosticTimeoutMs);

    return {
      status: "ok",
      elapsedMs: Math.round(performance.now() - startedAt),
      result,
    };
  } catch (error: unknown) {
    return {
      status: classifyQueryError(error),
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }
}

function classifyQueryError(error: unknown): DiagnosticStatus {
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

function combineStatuses(
  first: DiagnosticStatus,
  second: DiagnosticStatus,
): DiagnosticStatus {
  if (first === "ok" && second === "ok") {
    return "ok";
  }

  if (first === "timeout" || second === "timeout") {
    return "timeout";
  }

  if (first === "relation_missing" || second === "relation_missing") {
    return "relation_missing";
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
