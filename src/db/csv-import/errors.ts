import { z } from "zod";

export class CsvImportError extends Error {
  constructor(
    message: string,
    public readonly details: CsvImportErrorDetail[] = [],
  ) {
    super(message);
    this.name = "CsvImportError";
  }
}

export type CsvImportErrorDetail = {
  file: string;
  rowNumber?: number;
  entityType?: string;
  sourceId?: string;
  code: string;
  message: string;
  rawRow?: Record<string, string>;
};

export function formatImportError(error: unknown) {
  if (error instanceof CsvImportError) {
    return [
      error.message,
      ...error.details.map((detail) => {
        const location = [
          detail.file,
          detail.rowNumber ? `row ${detail.rowNumber}` : undefined,
          detail.sourceId ? `source ${detail.sourceId}` : undefined,
        ]
          .filter(Boolean)
          .join(" / ");

        return `- ${location}: [${detail.code}] ${detail.message}`;
      }),
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function zodIssuesToDetails(
  file: string,
  rowNumber: number,
  entityType: string,
  sourceId: string | undefined,
  rawRow: Record<string, string>,
  error: z.ZodError,
) {
  return error.issues.map((issue) => ({
    file,
    rowNumber,
    entityType,
    sourceId,
    code: "VALIDATION_ERROR",
    message: `${issue.path.join(".") || "(row)"}: ${issue.message}`,
    rawRow,
  }));
}
