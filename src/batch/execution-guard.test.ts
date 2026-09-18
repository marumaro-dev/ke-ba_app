import { describe, expect, it } from "vitest";

import { assertBatchConnection, assertProductionGitState, parseBatchExecution } from "./execution-guard";

const target = ["--from", "2027-02-01", "--to", "2027-02-01", "--venue", "hanshin",
  "--bundle-version", "v001"];
const production = ["--environment", "production", ...target];
const connection = {
  databaseUrl: "postgresql://postgres.synthetic@region.pooler.supabase.com:5432/postgres?sslmode=require",
  supabaseUrl: "https://synthetic.supabase.co",
  cwd: "C:/synthetic/workspace",
};

describe("batch execution safety", () => {
  it("defaults to Preview and keeps its existing mode", () => {
    expect(parseBatchExecution(["--dry-run"]).environment).toBe("preview");
    expect(parseBatchExecution(["--apply"]).mode).toBe("--apply");
  });

  it("accepts matching Preview identity and rejects Production APP_ENV", () => {
    expect(assertBatchConnection({ ...connection, environment: "preview", appEnv: "preview",
      execArgv: ["--env-file=.env.local"] })).toMatchObject({ environment: "preview" });
    expect(() => assertBatchConnection({ ...connection, environment: "preview", appEnv: "production",
      execArgv: ["--env-file=.env.local"] })).toThrow();
    // Existing tsx Preview entry point does not preserve execArgv.
    expect(assertBatchConnection({ ...connection, environment: "preview", appEnv: "preview",
      execArgv: [] })).toMatchObject({ environment: "preview" });
  });

  it("accepts matching Production identity only with its exact env file", () => {
    expect(assertBatchConnection({ ...connection, environment: "production", appEnv: "production",
      execArgv: ["--import", "tsx", "--env-file=.env.production.local"] }))
      .toMatchObject({ environment: "production" });
    for (const input of [
      { appEnv: "preview", execArgv: ["--env-file=.env.production.local"] },
      { appEnv: "production", execArgv: ["--env-file=.env.local"] },
      { appEnv: "production", execArgv: [] },
    ]) {
      expect(() => assertBatchConnection({ ...connection, environment: "production", ...input }))
        .toThrow();
    }
  });

  it("requires a single date, venue, existing bundle, and explicit apply confirmation", () => {
    expect(parseBatchExecution(["--dry-run", ...production]).environment).toBe("production");
    expect(() => parseBatchExecution(["--apply", ...production])).toThrow();
    expect(parseBatchExecution(["--apply", ...production, "--confirm-production"]).mode)
      .toBe("--apply");
    expect(() => parseBatchExecution(["--apply", "--environment", "production",
      "--confirm-production"])).toThrow();
    expect(() => parseBatchExecution(["--apply", ...production.filter((item) => item !== "hanshin"),
      "--confirm-production"])).toThrow();
    expect(() => parseBatchExecution(["--dry-run", ...production,
      "--source-times-map", "synthetic.json"])).toThrow();
  });

  it("rejects legacy 6/14 apply without weakening general conflict handling", () => {
    expect(() => parseBatchExecution(["--apply", "--environment", "production",
      "--from", "2026-06-14", "--to", "2026-06-14", "--venue", "hanshin",
      "--bundle-version", "v001", "--confirm-production"])).toThrow();
  });

  it("requires clean main for Production apply", () => {
    expect(() => assertProductionGitState("main", "")).not.toThrow();
    expect(() => assertProductionGitState("codex/test", "")).toThrow();
    expect(() => assertProductionGitState("main", " M synthetic.ts")).toThrow();
  });
});
