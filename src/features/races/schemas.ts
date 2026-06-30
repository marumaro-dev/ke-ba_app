import { z } from "zod";

export const raceIdSchema = z.string().uuid();

export const raceSurfaceFilterSchema = z.enum(["all", "turf", "dirt"]);

export const raceListSearchParamsSchema = z.object({
  raceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  venue: z.string().trim().min(1).optional().catch(undefined),
  surface: raceSurfaceFilterSchema.optional().catch("all"),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

export type RaceListSearchParams = {
  raceDate?: string;
  venue?: string;
  surface: z.infer<typeof raceSurfaceFilterSchema>;
  page: number;
};

export const raceListPageSize = 12;

export function parseRaceListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = raceListSearchParamsSchema.parse({
    raceDate: getSingleValue(searchParams.raceDate),
    venue: getSingleValue(searchParams.venue),
    surface: getSingleValue(searchParams.surface),
    page: getSingleValue(searchParams.page),
  });

  return {
    raceDate: parsed.raceDate,
    venue: parsed.venue,
    surface: parsed.surface ?? "all",
    page: parsed.page ?? 1,
  } satisfies RaceListSearchParams;
}

export function buildRaceListHref(
  params: RaceListSearchParams,
  overrides: Partial<RaceListSearchParams> = {},
) {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();

  if (merged.raceDate) {
    query.set("raceDate", merged.raceDate);
  }

  if (merged.venue) {
    query.set("venue", merged.venue);
  }

  if (merged.surface && merged.surface !== "all") {
    query.set("surface", merged.surface);
  }

  if (merged.page && merged.page > 1) {
    query.set("page", String(merged.page));
  }

  const queryString = query.toString();
  return queryString ? `/races?${queryString}` : "/races";
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
