import { asc, count } from "drizzle-orm";

import { getDb } from "@/db";
import { races } from "@/db/schema";
import {
  formatDate,
  formatDateTime,
  formatRaceCountLabel,
} from "@/features/races/formatters";
import { getRaceFilterOptions, listRaces } from "@/features/races/queries";
import {
  parseRaceListSearchParams,
  raceListPageSize,
} from "@/features/races/schemas";

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

// Temporary Preview-only diagnostic route. Remove it after the /races page
// timeout has been identified. It returns only aggregate metadata and never
// exposes race rows, connection details, environment secrets, or raw errors.
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const startedAt = performance.now();
  const filters = parseRaceListSearchParams({});
  const offset = (filters.page - 1) * raceListPageSize;

  // Run the stages in this order so the earliest failure identifies the first
  // page-specific operation that stopped completing.
  const listQuery = await runStage(async () => {
    const rows = await getDb()
      .select({
        id: races.id,
        raceDate: races.raceDate,
        venue: races.venue,
        raceNumber: races.raceNumber,
        name: races.name,
        scheduledStartAt: races.scheduledStartAt,
        surface: races.surface,
        distanceMeters: races.distanceMeters,
        status: races.status,
        observedAt: races.observedAt,
      })
      .from(races)
      .orderBy(asc(races.scheduledStartAt), asc(races.raceNumber))
      .limit(raceListPageSize)
      .offset(offset);

    return { rowCount: rows.length, rowFound: rows.length > 0 };
  });

  const countQuery = await runStage(async () => {
    const rows = await getDb().select({ value: count() }).from(races);

    return { count: rows[0]?.value ?? 0 };
  });

  const raceDateDistinctQuery = await runStage(async () => {
    const rows = await getDb()
      .selectDistinct({ value: races.raceDate })
      .from(races)
      .orderBy(asc(races.raceDate));

    return { rowCount: rows.length };
  });

  const venueDistinctQuery = await runStage(async () => {
    const rows = await getDb()
      .selectDistinct({ value: races.venue })
      .from(races)
      .orderBy(asc(races.venue));

    return { rowCount: rows.length };
  });

  const listRacesFunction = await runStage(async () => {
    const result = await listRaces(filters);

    return {
      itemCount: result.items.length,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
    };
  });

  const filterOptionsFunction = await runStage(async () => {
    const result = await getRaceFilterOptions();

    return {
      raceDateCount: result.raceDates.length,
      venueCount: result.venues.length,
    };
  });

  const pagePromiseAllAndFormatting = await runStage(async () => {
    const [raceList, filterOptions] = await Promise.all([
      listRaces(filters),
      getRaceFilterOptions(),
    ]);

    // Exercise the same formatting and mapping paths used by page.tsx without
    // returning the formatted values or any source row data.
    raceList.items.map((race) => ({
      raceDate: formatDate(race.raceDate),
      scheduledStartAt: formatDateTime(race.scheduledStartAt),
      observedAt: formatDateTime(race.observedAt),
      distanceMeters: race.distanceMeters.toLocaleString(),
    }));
    filterOptions.raceDates.map(formatDate);
    filterOptions.venues.map((venue) => venue);
    formatRaceCountLabel(raceList.totalCount, raceList.pageSize);

    return {
      itemCount: raceList.items.length,
      totalCount: raceList.totalCount,
      raceDateCount: filterOptions.raceDates.length,
      venueCount: filterOptions.venues.length,
      formattingCompleted: true,
    };
  });

  const stages = {
    listQuery,
    countQuery,
    raceDateDistinctQuery,
    venueDistinctQuery,
    listRacesFunction,
    filterOptionsFunction,
    pagePromiseAllAndFormatting,
  };
  const failedStage = Object.entries(stages).find(
    ([, stage]) => stage.status !== "ok",
  );
  const overall = failedStage?.[1].status ?? "ok";

  return Response.json(
    {
      appEnv: normalizeEnvironment(process.env.APP_ENV),
      vercelEnv: normalizeEnvironment(process.env.VERCEL_ENV),
      clientKind: "shared-drizzle",
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

async function runStage<T extends object>(
  operation: () => Promise<T>,
): Promise<StageDiagnostic<T>> {
  const startedAt = performance.now();

  try {
    const result = await withTimeout(operation(), diagnosticTimeoutMs);

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
