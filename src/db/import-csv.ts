import path from "node:path";

import { formatImportError } from "./csv-import/errors";
import { formatImportSummary, importCsv } from "./csv-import/importer";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const csvDir = path.resolve(
  process.cwd(),
  getArgValue("--csv-dir") ?? "samples/csv",
);

importCsv({ csvDir, dryRun })
  .then((result) => {
    console.log(formatImportSummary(result));
  })
  .catch((error: unknown) => {
    console.error(formatImportError(error));
    process.exitCode = 1;
  });

function getArgValue(name: string) {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
