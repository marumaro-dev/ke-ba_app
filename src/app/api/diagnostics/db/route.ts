import postgres from "postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const diagnosticTimeoutMs = 8_000;

type Connectivity =
  | "ok"
  | "timeout"
  | "auth_failed"
  | "invalid_url"
  | "unknown_error";

type SafeDatabaseUrlDetails = {
  databaseUrlPresent: boolean;
  protocolValid: boolean;
  hostKind: "supabase-pooler" | "supabase-direct" | "unknown";
  port: 6543 | 5432 | "unknown";
  sslMode: "require" | "missing" | "unknown";
};

// Temporary Preview-only diagnostic route. Remove it after the Preview database
// connectivity issue has been identified. Never add raw URL or error details here.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const startedAt = performance.now();
  const databaseUrl = process.env.DATABASE_URL;
  const urlDetails = inspectDatabaseUrl(databaseUrl);
  let connectivity: Connectivity = "unknown_error";

  if (!databaseUrl || !urlDetails.protocolValid) {
    connectivity = "invalid_url";
  } else {
    const sql = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });

    try {
      await withTimeout(sql`select 1`, diagnosticTimeoutMs);
      connectivity = "ok";
    } catch (error: unknown) {
      connectivity = classifyConnectionError(error);
    } finally {
      await sql.end({ timeout: 1 }).catch(() => undefined);
    }
  }

  return Response.json(
    {
      ...urlDetails,
      appEnv: normalizeEnvironment(process.env.APP_ENV),
      vercelEnv: normalizeEnvironment(process.env.VERCEL_ENV),
      connectivity,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
    {
      status: connectivity === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function inspectDatabaseUrl(value: string | undefined): SafeDatabaseUrlDetails {
  const fallback: SafeDatabaseUrlDetails = {
    databaseUrlPresent: Boolean(value),
    protocolValid: false,
    hostKind: "unknown",
    port: "unknown",
    sslMode: value ? "unknown" : "missing",
  };

  if (!value) {
    return fallback;
  }

  try {
    const url = new URL(value);
    const protocolValid =
      url.protocol === "postgresql:" || url.protocol === "postgres:";
    const hostname = url.hostname.toLowerCase();
    const port = Number(url.port);
    const sslModeValue = url.searchParams.get("sslmode");

    return {
      databaseUrlPresent: true,
      protocolValid,
      hostKind: hostname.endsWith(".pooler.supabase.com")
        ? "supabase-pooler"
        : hostname.endsWith(".supabase.co")
          ? "supabase-direct"
          : "unknown",
      port: port === 6543 || port === 5432 ? port : "unknown",
      sslMode:
        sslModeValue === null
          ? "missing"
          : sslModeValue.toLowerCase() === "require"
            ? "require"
            : "unknown",
    };
  } catch {
    return fallback;
  }
}

function normalizeEnvironment(value: string | undefined) {
  return value === "development" || value === "preview" || value === "production"
    ? value
    : "unknown";
}

function classifyConnectionError(error: unknown): Connectivity {
  if (error instanceof DiagnosticTimeoutError) {
    return "timeout";
  }

  const code = getErrorCode(error);

  if (code === "28P01" || code === "28000") {
    return "auth_failed";
  }

  if (code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return "timeout";
  }

  return "unknown_error";
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
