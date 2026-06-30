import { z } from "zod";

export const featureGenerationBatchIdSchema = z.string().uuid();

export const featureBatchStatusFilterSchema = z.enum([
  "all",
  "running",
  "succeeded",
  "failed",
]);

export const featureBatchListSearchParamsSchema = z.object({
  status: featureBatchStatusFilterSchema.optional().catch("all"),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

export type FeatureBatchListSearchParams = {
  status: z.infer<typeof featureBatchStatusFilterSchema>;
  page: number;
};

export const featureBatchListPageSize = 20;

export function parseFeatureBatchListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = featureBatchListSearchParamsSchema.parse({
    status: getSingleValue(searchParams.status),
    page: getSingleValue(searchParams.page),
  });

  return {
    status: parsed.status ?? "all",
    page: parsed.page ?? 1,
  } satisfies FeatureBatchListSearchParams;
}

export function buildFeatureBatchListHref(
  params: FeatureBatchListSearchParams,
  overrides: Partial<FeatureBatchListSearchParams> = {},
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
  return queryString ? `/features?${queryString}` : "/features";
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
