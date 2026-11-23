import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { RunRecap } from "../../game/types.ts";
import { insertLeaderboardRun, listPublicBoard, type LeaderboardSql } from "./store.ts";
import { LEADERBOARD_LIMIT } from "./constants.ts";

const OID_INT8 = 20;
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(join(root, "migrations/0002_leaderboard.sql"), "utf8");

function recap(partial: Partial<RunRecap> = {}): RunRecap {
  return {
    playMode: "classic",
    ballId: "plain",
    ballLabel: "经典球",
    sceneId: "street",
    sceneLabel: "街头",
    gameRev: 332,
    score: 40,
    peakCombo: 4,
    peakMake: 12,
    durationSeconds: 20,
    makes: 5,
    misses: 1,
    clicks: 10,
    holds: 0,
    skillInputs: 0,
    skillActiveSeconds: 0,
    skillLockSeconds: 0,
    clutchMakes: 0,
    map: {},
    ...partial,
  };
}

function toSql(pg: PGlite): LeaderboardSql {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb() {
  const pg = new PGlite({ parsers: { [OID_INT8]: Number } });
  await pg.waitReady;
  await pg.exec(migration);
  return { pg, sql: toSql(pg) };
}

test("migration creates leaderboard_runs and lists top scores with public fields only", async () => {
  const { pg, sql } = await openDb();
  const flags = { sandbox: false, balance: false, scoreLock: false, comboLock: false };

  await insertLeaderboardRun(sql, {
    nickname: "乙",
    mode: "classic",
    score: 50,
    recap: recap({ score: 50, peakCombo: 8, ballLabel: "冰球" }),
    timeline: [{ t: 1, kind: "score", points: 50 }],
    flags,
  }, "run-b");
  await insertLeaderboardRun(sql, {
    nickname: "甲",
    mode: "classic",
    score: 50,
    recap: recap({ score: 50, peakCombo: 9, ballLabel: "经典球+时间球" }),
    timeline: [{ t: 1, kind: "score", points: 50 }],
    flags,
  }, "run-a");
  await insertLeaderboardRun(sql, {
    nickname: "丙",
    mode: "classic",
    score: 40,
    recap: recap({ score: 40, peakCombo: 20, ballLabel: "忍者球" }),
    timeline: [{ t: 1, kind: "score", points: 40 }],
    flags,
  }, "run-c");
  await insertLeaderboardRun(sql, {
    nickname: "丁",
    mode: "minute",
    score: 90,
    recap: recap({ playMode: "minute", score: 90, durationSeconds: 60, peakCombo: 6, ballLabel: "闪电球" }),
    timeline: [{ t: 1, kind: "score", points: 90 }],
    flags,
  }, "run-d");

  const classic = await listPublicBoard(sql, "classic");
  assert.equal(classic.length, 3);
  assert.deepEqual(classic.map((row) => row.id), ["run-a", "run-b", "run-c"]);
  assert.deepEqual(
    classic.map((row) => ({ rank: row.rank, nickname: row.nickname, ballLabel: row.ballLabel, score: row.score, peakCombo: row.peakCombo })),
    [
      { rank: 1, nickname: "甲", ballLabel: "经典球+时间球", score: 50, peakCombo: 9 },
      { rank: 2, nickname: "乙", ballLabel: "冰球", score: 50, peakCombo: 8 },
      { rank: 3, nickname: "丙", ballLabel: "忍者球", score: 40, peakCombo: 20 },
    ],
  );
  for (const row of classic) {
    assert.equal("timeline" in row, false);
    assert.equal("flags" in row, false);
    assert.equal("reviewFlags" in row, false);
    assert.equal("recap" in row, false);
  }

  const minute = await listPublicBoard(sql, "minute");
  assert.equal(minute.length, 1);
  assert.equal(minute[0]?.nickname, "丁");
  assert.equal(minute[0]?.score, 90);

  const stored = await pg.query<{ review_flags: unknown; timeline: unknown; flags: unknown }>(
    "select review_flags, timeline, flags from leaderboard_runs where id = $1",
    ["run-a"],
  );
  assert.ok(stored.rows[0]?.timeline);
  assert.ok(stored.rows[0]?.flags);
  assert.ok(Array.isArray(stored.rows[0]?.review_flags) || stored.rows[0]?.review_flags);

  assert.equal(LEADERBOARD_LIMIT, 100);
  await pg.close();
});

test("flagged rows are still inserted and still appear on the public board", async () => {
  const { pg, sql } = await openDb();
  const inserted = await insertLeaderboardRun(sql, {
    nickname: "可疑",
    mode: "classic",
    score: 99,
    recap: recap({ score: 10, makes: 0, durationSeconds: 20 }),
    timeline: [{ t: 1, kind: "score", points: 10 }],
    flags: { sandbox: false, balance: false, scoreLock: false, comboLock: false },
  }, "flagged");
  assert.ok(inserted.reviewFlags.includes("score_mismatch"));
  assert.ok(inserted.reviewFlags.includes("score_without_makes"));
  const rows = await listPublicBoard(sql, "classic");
  assert.equal(rows[0]?.id, "flagged");
  assert.equal(rows[0]?.nickname, "可疑");
  assert.equal(rows[0]?.score, 99);
  await pg.close();
});
