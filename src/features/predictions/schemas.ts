import { z } from "zod";

export const predictionRunIdSchema = z.string().uuid();

export const predictionRunStatusFilterSchema = z.enum([
  "all",
  "running",
  "succeeded",
  "failed",
]);

export const predictionRunListSearchParamsSchema = z.object({
  status: predictionRunStatusFilterSchema.optional().catch("all"),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

export const predictionAnalyticsEvaluationStatusSchema = z.enum([
  "all",
  "evaluated",
  "unevaluated",
]);

export const predictionAnalyticsSearchParamsSchema = z.object({
  modelVersion: z.string().trim().optional().catch(undefined),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  evaluationStatus: predictionAnalyticsEvaluationStatusSchema
    .optional()
    .catch("all"),
});

export type PredictionRunListSearchParams = {
  status: z.infer<typeof predictionRunStatusFilterSchema>;
  page: number;
};

export type PredictionAnalyticsSearchParams = {
  modelVersion: string;
  asOfDate: string;
  evaluationStatus: z.infer<typeof predictionAnalyticsEvaluationStatusSchema>;
};

export const predictionRunListPageSize = 20;

export function parsePredictionRunListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = predictionRunListSearchParamsSchema.parse({
    status: getSingleValue(searchParams.status),
    page: getSingleValue(searchParams.page),
  });

  return {
    status: parsed.status ?? "all",
    page: parsed.page ?? 1,
  } satisfies PredictionRunListSearchParams;
}

export function buildPredictionRunListHref(
  params: PredictionRunListSearchParams,
  overrides: Partial<PredictionRunListSearchParams> = {},
) {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();

  if (merged.status !== "all") {
    query.set("status", merged.status);
  }

  if (merged.page > 1) {
    query.set("page", String(merged.page));
  }

  const queryString = query.toString();
  return queryString ? `/predictions?${queryString}` : "/predictions";
}

export function parsePredictionAnalyticsSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = predictionAnalyticsSearchParamsSchema.parse({
    modelVersion: getSingleValue(searchParams.modelVersion),
    asOfDate: getSingleValue(searchParams.asOfDate),
    evaluationStatus: getSingleValue(searchParams.evaluationStatus),
  });

  return {
    modelVersion: parsed.modelVersion ?? "all",
    asOfDate: parsed.asOfDate ?? "",
    evaluationStatus: parsed.evaluationStatus ?? "all",
  } satisfies PredictionAnalyticsSearchParams;
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
