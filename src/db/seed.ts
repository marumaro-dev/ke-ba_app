import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { buildDatabaseErrorMessage } from "./error-message";
import { loadLocalEnv } from "../lib/load-env";
import {
  horses,
  jockeys,
  raceEntries,
  raceResults,
  races,
  trainers,
} from "./schema";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    [
      "DATABASE_URL is required to seed the database.",
      "Set it in .env.local or in the command execution environment.",
    ].join("\n"),
  );
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});
const db = drizzle(client);

const ids = {
  races: {
    tokyo: "10000000-0000-4000-8000-000000000001",
    kyoto: "10000000-0000-4000-8000-000000000002",
  },
  horses: {
    northWind: "20000000-0000-4000-8000-000000000001",
    silverLine: "20000000-0000-4000-8000-000000000002",
    greenEcho: "20000000-0000-4000-8000-000000000003",
    moonRiver: "20000000-0000-4000-8000-000000000004",
    amberLight: "20000000-0000-4000-8000-000000000005",
  },
  jockeys: {
    aoki: "30000000-0000-4000-8000-000000000001",
    tanaka: "30000000-0000-4000-8000-000000000002",
    sato: "30000000-0000-4000-8000-000000000003",
  },
  trainers: {
    ito: "40000000-0000-4000-8000-000000000001",
    yamada: "40000000-0000-4000-8000-000000000002",
    suzuki: "40000000-0000-4000-8000-000000000003",
  },
  entries: {
    northWind: "50000000-0000-4000-8000-000000000001",
    silverLine: "50000000-0000-4000-8000-000000000002",
    greenEcho: "50000000-0000-4000-8000-000000000003",
    moonRiver: "50000000-0000-4000-8000-000000000004",
    amberLight: "50000000-0000-4000-8000-000000000005",
  },
  results: {
    northWind: "60000000-0000-4000-8000-000000000001",
    silverLine: "60000000-0000-4000-8000-000000000002",
    greenEcho: "60000000-0000-4000-8000-000000000003",
  },
} as const;

const observedAt = new Date("2026-06-25T23:30:00.000Z");
const importedAt = new Date("2026-06-25T23:35:00.000Z");

async function seed() {
  await db.transaction(async (tx) => {
    await tx
      .insert(horses)
      .values([
        {
          id: ids.horses.northWind,
          name: "ノースウインド",
          birthDate: "2022-03-12",
          sex: "male",
          color: "鹿毛",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.horses.silverLine,
          name: "シルバーライン",
          birthDate: "2022-04-02",
          sex: "female",
          color: "芦毛",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.horses.greenEcho,
          name: "グリーンエコー",
          birthDate: "2022-02-18",
          sex: "male",
          color: "黒鹿毛",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.horses.moonRiver,
          name: "ムーンリバー",
          birthDate: "2021-03-24",
          sex: "female",
          color: "鹿毛",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.horses.amberLight,
          name: "アンバーライト",
          birthDate: "2021-05-08",
          sex: "gelding",
          color: "栗毛",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(jockeys)
      .values([
        {
          id: ids.jockeys.aoki,
          name: "青木 太郎",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.jockeys.tanaka,
          name: "田中 花",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.jockeys.sato,
          name: "佐藤 海",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(trainers)
      .values([
        {
          id: ids.trainers.ito,
          name: "伊藤 一",
          affiliation: "美浦",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.trainers.yamada,
          name: "山田 光",
          affiliation: "栗東",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
        {
          id: ids.trainers.suzuki,
          name: "鈴木 誠",
          affiliation: "美浦",
          availableAt: observedAt,
          observedAt,
          importedAt,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(races)
      .values([
        {
          id: ids.races.tokyo,
          raceDate: "2026-06-27",
          venue: "東京",
          raceNumber: 11,
          name: "サンプルグリーンステークス",
          scheduledStartAt: new Date("2026-06-27T06:40:00.000Z"),
          surface: "芝",
          distanceMeters: 1600,
          weather: "晴",
          trackCondition: "良",
          status: "confirmed",
          availableAt: new Date("2026-06-25T00:00:00.000Z"),
          observedAt,
          importedAt,
        },
        {
          id: ids.races.kyoto,
          raceDate: "2026-06-28",
          venue: "京都",
          raceNumber: 9,
          name: "サンプルリバーカップ",
          scheduledStartAt: new Date("2026-06-28T05:25:00.000Z"),
          surface: "ダート",
          distanceMeters: 1800,
          status: "scheduled",
          availableAt: new Date("2026-06-25T00:00:00.000Z"),
          observedAt,
          importedAt,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(raceEntries)
      .values([
        {
          id: ids.entries.northWind,
          raceId: ids.races.tokyo,
          horseId: ids.horses.northWind,
          jockeyId: ids.jockeys.aoki,
          trainerId: ids.trainers.ito,
          frameNumber: 1,
          horseNumber: 1,
          assignedWeight: "57.0",
          bodyWeight: 480,
          bodyWeightDiff: 4,
          status: "running",
          availableAt: new Date("2026-06-26T03:00:00.000Z"),
          observedAt,
          importedAt,
        },
        {
          id: ids.entries.silverLine,
          raceId: ids.races.tokyo,
          horseId: ids.horses.silverLine,
          jockeyId: ids.jockeys.tanaka,
          trainerId: ids.trainers.yamada,
          frameNumber: 3,
          horseNumber: 5,
          assignedWeight: "55.0",
          bodyWeight: 462,
          bodyWeightDiff: -2,
          status: "running",
          availableAt: new Date("2026-06-26T03:00:00.000Z"),
          observedAt,
          importedAt,
        },
        {
          id: ids.entries.greenEcho,
          raceId: ids.races.tokyo,
          horseId: ids.horses.greenEcho,
          jockeyId: ids.jockeys.sato,
          trainerId: ids.trainers.suzuki,
          frameNumber: 6,
          horseNumber: 11,
          assignedWeight: "57.0",
          bodyWeight: 498,
          bodyWeightDiff: 0,
          status: "running",
          availableAt: new Date("2026-06-26T03:00:00.000Z"),
          observedAt,
          importedAt,
        },
        {
          id: ids.entries.moonRiver,
          raceId: ids.races.kyoto,
          horseId: ids.horses.moonRiver,
          jockeyId: ids.jockeys.tanaka,
          trainerId: ids.trainers.yamada,
          frameNumber: 2,
          horseNumber: 3,
          assignedWeight: "55.0",
          status: "entered",
          availableAt: new Date("2026-06-26T03:00:00.000Z"),
          observedAt,
          importedAt,
        },
        {
          id: ids.entries.amberLight,
          raceId: ids.races.kyoto,
          horseId: ids.horses.amberLight,
          jockeyId: ids.jockeys.aoki,
          trainerId: ids.trainers.ito,
          frameNumber: 5,
          horseNumber: 9,
          assignedWeight: "57.0",
          status: "entered",
          availableAt: new Date("2026-06-26T03:00:00.000Z"),
          observedAt,
          importedAt,
        },
      ])
      .onConflictDoNothing();

    await tx
      .insert(raceResults)
      .values([
        {
          id: ids.results.northWind,
          raceEntryId: ids.entries.northWind,
          finishPosition: 1,
          finishStatus: "finished",
          finishTimeMilliseconds: 93400,
          finalOdds: "3.8",
          popularity: 2,
          status: "confirmed",
          availableAt: new Date("2026-06-27T06:43:00.000Z"),
          observedAt: new Date("2026-06-27T06:46:00.000Z"),
          importedAt: new Date("2026-06-27T06:47:00.000Z"),
        },
        {
          id: ids.results.silverLine,
          raceEntryId: ids.entries.silverLine,
          finishPosition: 2,
          finishStatus: "finished",
          finishTimeMilliseconds: 93600,
          margin: "1 1/4",
          finalOdds: "2.6",
          popularity: 1,
          status: "confirmed",
          availableAt: new Date("2026-06-27T06:43:00.000Z"),
          observedAt: new Date("2026-06-27T06:46:00.000Z"),
          importedAt: new Date("2026-06-27T06:47:00.000Z"),
        },
        {
          id: ids.results.greenEcho,
          raceEntryId: ids.entries.greenEcho,
          finishPosition: 3,
          finishStatus: "finished",
          finishTimeMilliseconds: 93800,
          margin: "1 1/2",
          finalOdds: "6.4",
          popularity: 3,
          status: "confirmed",
          availableAt: new Date("2026-06-27T06:43:00.000Z"),
          observedAt: new Date("2026-06-27T06:46:00.000Z"),
          importedAt: new Date("2026-06-27T06:47:00.000Z"),
        },
      ])
      .onConflictDoNothing();

    await tx.execute(sql`select 1`);
  });
}

seed()
  .then(async () => {
    console.log("Seed completed.");
    await client.end();
  })
  .catch(async (error: unknown) => {
    console.error(buildDatabaseErrorMessage(error, "seed"));
    await client.end();
    process.exitCode = 1;
  });
