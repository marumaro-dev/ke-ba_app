import { z } from "zod";

export const importBatchIdSchema = z.string().uuid();

export const importModeFilterSchema = z.enum(["all", "dry_run", "import"]);

export const importStatusFilterSchema = z.enum([
  "all",
  "running",
  "succeeded",
  "failed",
]);

export const importListSearchParamsSchema = z.object({
  mode: importModeFilterSchema.optional().catch("all"),
  status: importStatusFilterSchema.optional().catch("all"),
  page: z.coerce.number().int().min(1).optional().catch(1),
});

export type ImportListSearchParams = {
  mode: z.infer<typeof importModeFilterSchema>;
  status: z.infer<typeof importStatusFilterSchema>;
  page: number;
};

export const importListPageSize = 20;

export function parseImportListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = importListSearchParamsSchema.parse({
    mode: getSingleValue(searchParams.mode),
    status: getSingleValue(searchParams.status),
    page: getSingleValue(searchParams.page),
  });

  return {
    mode: parsed.mode ?? "all",
    status: parsed.status ?? "all",
    page: parsed.page ?? 1,
  } satisfies ImportListSearchParams;
}

export function buildImportListHref(
  params: ImportListSearchParams,
  overrides: Partial<ImportListSearchParams> = {},
) {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();

  if (merged.mode !== "all") {
    query.set("mode", merged.mode);
  }

  if (merged.status !== "all") {
    query.set("status", merged.status);
  }

  if (merged.page > 1) {
    query.set("page", String(merged.page));
  }

  const queryString = query.toString();
  return queryString ? `/imports?${queryString}` : "/imports";
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
