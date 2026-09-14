import path from "node:path";

import { convertTargetResults } from "./converter";

const args = process.argv.slice(2);

convertTargetResults({
  input: path.resolve(requireValue("--input")),
  outputDir: path.resolve(requireValue("--output-dir")),
  providerCode: requireValue("--provider-code"),
  raceDate: requireValue("--race-date"),
  venue: requireValue("--venue"),
  venueCode: requireValue("--venue-code"),
  asOfAt: requireValue("--as-of-at"),
  overwrite: args.includes("--overwrite"),
})
  .then((result) => {
    console.log(`Converted one race to ${result.outputDir}`);
    for (const [key, count] of Object.entries(result.rowCounts)) {
      console.log(`- ${key}: ${count}`);
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

function requireValue(name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}
