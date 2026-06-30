import { readFile } from "node:fs/promises";

export type CsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export async function readCsvFile(filePath: string) {
  const text = await readFile(filePath, "utf8");
  return parseCsv(text);
}

export function parseCsv(text: string): CsvRow[] {
  const records = parseCsvRecords(stripBom(text));

  if (records.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = records;
  const normalizedHeaders = headers.map((header) => header.trim());

  return dataRows
    .map((values, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        normalizedHeaders.map((header, columnIndex) => [
          header,
          values[columnIndex]?.trim() ?? "",
        ]),
      ),
    }))
    .filter((row) =>
      Object.values(row.values).some((value) => value.trim() !== ""),
    );
}

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
