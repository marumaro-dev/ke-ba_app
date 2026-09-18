import path from "node:path";

export type BatchEnvironment = "preview" | "production";
export type BatchMode = "--scan" | "--dry-run" | "--apply";

export function parseBatchExecution(args: string[]) {
  const modes = (["--scan", "--dry-run", "--apply"] as const)
    .filter((mode) => args.includes(mode));
  if (modes.length !== 1) throw new Error("Exactly one batch mode is required");
  const value = (name: string) => {
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const selected = value("--environment") ?? "preview";
  if (selected !== "preview" && selected !== "production") {
    throw new Error("Invalid batch environment");
  }
  const environment: BatchEnvironment = selected;
  const mode = modes[0];
  const from = value("--from");
  const to = value("--to");
  const venue = value("--venue");
  const bundleVersion = value("--bundle-version");
  if (environment === "production" && mode !== "--scan") {
    if (!from || from !== to || !/^\d{4}-\d{2}-\d{2}$/.test(from)
      || !venue || !/^[a-z][a-z0-9_]*$/.test(venue)) {
      throw new Error("Production requires one explicit date and venue");
    }
    if (!bundleVersion || !/^v\d{3,}$/.test(bundleVersion)) {
      throw new Error("Production requires an existing bundle version");
    }
    if (value("--source-times-map") !== undefined) {
      throw new Error("Production source times map is not allowed in this batch");
    }
    if (mode === "--apply" && !args.includes("--confirm-production")) {
      throw new Error("Production apply requires --confirm-production");
    }
    if (mode === "--apply" && from === "2026-06-14" && venue === "hanshin") {
      throw new Error("Legacy imported day cannot be applied");
    }
  } else if (args.includes("--confirm-production")) {
    throw new Error("--confirm-production is valid only for Production apply");
  }
  return { mode, environment, filters: { from, to, venue }, bundleVersion };
}

export function assertBatchConnection(input: {
  environment: BatchEnvironment;
  appEnv?: string;
  databaseUrl?: string;
  supabaseUrl?: string;
  execArgv: string[];
  cwd: string;
}) {
  if (input.appEnv !== input.environment || !input.databaseUrl || !input.supabaseUrl) {
    throw new Error("Batch environment does not match APP_ENV");
  }
  const expectedFile = input.environment === "production"
    ? ".env.production.local" : ".env.local";
  const envFiles = input.execArgv.filter((arg) => arg.startsWith("--env-file="))
    .map((arg) => path.resolve(input.cwd, arg.slice("--env-file=".length)));
  // The existing tsx CLI does not preserve Node's --env-file in execArgv.
  // Keep that Preview entry point working; Production requires an inspectable Node flag.
  if ((input.environment === "production" && envFiles.length !== 1)
    || envFiles.length > 1
    || (envFiles.length === 1 && envFiles[0] !== path.resolve(input.cwd, expectedFile))) {
    throw new Error("Batch environment file mismatch");
  }
  const db = new URL(input.databaseUrl);
  const api = new URL(input.supabaseUrl);
  const ref = api.hostname.split(".")[0];
  if (!ref || !["postgres:", "postgresql:"].includes(db.protocol)
    || !db.hostname.endsWith("pooler.supabase.com")
    || !api.hostname.endsWith("supabase.co")
    || db.searchParams.get("sslmode") !== "require"
    || !db.username.endsWith(`.${ref}`)) {
    throw new Error("Batch connection identity check failed");
  }
  return { environment: input.environment, pooler: true, sslRequired: true,
    projectIdentifiersMatch: true };
}

export function assertProductionGitState(branch: string, status: string) {
  if (branch.trim() !== "main") throw new Error("Production apply requires main branch");
  if (status.trim()) throw new Error("Production apply requires a clean worktree");
}
