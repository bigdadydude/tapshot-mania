import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_S_REQUIRED_RUNS,
  automaticStrength,
  autoStrengthForBall,
  balanceExportPayload,
  csv,
  DEFAULT_BALANCE_CONFIG,
  type BalanceSession,
  type BalanceStore,
  type BalanceTrial,
} from "./balance-test.ts";

function trial(partial: Pick<BalanceTrial, "ballId" | "skillState" | "score"> & Partial<BalanceTrial>): BalanceTrial {
  const {
    id,
    sessionId,
    maxCombo,
    triggers,
    skillScore,
    makes,
    misses,
    maxMakeGapSeconds,
    completed,
    timestamp,
    gameRev,
    configKey,
    ...rest
  } = partial;
  return {
    id: id ?? `${partial.ballId}-${partial.skillState}-${partial.score}`,
    sessionId: sessionId ?? "s1",
    maxCombo: maxCombo ?? 1,
    triggers: triggers ?? 0,
    skillScore: skillScore ?? 0,
    makes: makes ?? 1,
    misses: misses ?? 0,
    maxMakeGapSeconds: maxMakeGapSeconds ?? 1,
    completed: completed ?? true,
    timestamp: timestamp ?? "2026-10-02T00:00:00.000Z",
    gameRev: gameRev ?? 1,
    configKey: configKey ?? "{}",
    ...rest,
  };
}

function store(sessions: BalanceSession[]): BalanceStore {
  return { version: 1, config: structuredClone(DEFAULT_BALANCE_CONFIG), sessions };
}

function session(ballId: BalanceTrial["ballId"], trials: BalanceTrial[]): BalanceSession {
  return {
    id: "s1",
    baseline: "plain",
    ballId,
    scene: "street",
    playMode: "minute",
    physKey: "",
    createdAt: "2026-10-02T00:00:00.000Z",
    gameRev: 1,
    trials,
  };
}

test("missing buckets name the gap instead of a blank auto S", () => {
  const data = store([
    session("bolt", [
      ...Array.from({ length: 3 }, (_, i) => trial({ ballId: "bolt", skillState: "on", score: 10 + i })),
      ...Array.from({ length: 10 }, (_, i) => trial({ ballId: "bolt", skillState: "off", score: 8 + i })),
    ]),
  ]);
  const row = autoStrengthForBall(data, "bolt");
  assert.equal(row.autoS, null);
  assert.equal(row.provisional, false);
  assert.equal(row.label, "自动 S：—（开技能 3/10，关技能 10/10，缺基准）");
  assert.equal(row.componentsLabel, "得分 — · 容错 — · 节奏 — · 爆发 — · 代价 待测");
  assert.equal(AUTO_S_REQUIRED_RUNS, 10);
});

test("one round of each bucket shows a provisional value and keeps cost pending", () => {
  const data = store([
    session("bolt", [
      trial({ ballId: "plain", skillState: "baseline", score: 100 }),
      trial({ ballId: "bolt", skillState: "off", score: 80 }),
      trial({ ballId: "bolt", skillState: "on", score: 100, triggers: 1, skillScore: 20, directScore: 20 }),
    ]),
  ]);
  const row = autoStrengthForBall(data, "bolt");
  const direct = automaticStrength(data.sessions[0]!, data.config);
  assert.equal(row.autoS, direct.autoS);
  assert.ok(row.autoS !== null);
  assert.equal(row.provisional, true);
  assert.equal(row.label, `自动 S：${row.autoS.toFixed(2)}（暂算 · 开技能 1/10，关技能 1/10，基准 1/10）`);
  assert.match(row.label, /自动 S：-?\d+\.\d{2}（暂算/);
  assert.equal(row.costLabel, "待测");
  assert.match(row.componentsLabel, /代价 待测$/);
  assert.equal(direct.cost, "pending_input_telemetry");
});

test("full samples stay provisional because weights are initial", () => {
  const trials: BalanceTrial[] = [];
  for (let i = 0; i < 10; i += 1) {
    trials.push(trial({ id: `b${i}`, ballId: "plain", skillState: "baseline", score: 100 }));
    trials.push(trial({ id: `off${i}`, ballId: "bolt", skillState: "off", score: 70 }));
    trials.push(
      trial({
        id: `on${i}`,
        ballId: "bolt",
        skillState: "on",
        score: 100,
        clicks: 4,
        holds: 1,
        skillInputs: 2,
        skillActiveSeconds: 3,
      }),
    );
  }
  const data = store([session("bolt", trials)]);
  const row = autoStrengthForBall(data, "bolt");
  assert.ok(row.autoS !== null);
  assert.equal(row.label, `自动 S：${row.autoS.toFixed(2)}（暂算）`);
  assert.notEqual(row.costLabel, "待测");
  assert.equal(row.auto.cost, "ready");
});

test("classic ball reports baseline rounds and does not invent a skill S", () => {
  const data = store([
    session("plain", [trial({ ballId: "plain", skillState: "baseline", score: 40 })]),
  ]);
  const row = autoStrengthForBall(data, "plain");
  assert.equal(row.autoS, null);
  assert.equal(row.label, "自动 S：—（基准球不测技能，已有 1/10 局）");
});

test("json and csv append auto S without changing trial fields", () => {
  const data = store([
    session("bolt", [
      trial({ ballId: "plain", skillState: "baseline", score: 50, configKey: "k" }),
      trial({ ballId: "bolt", skillState: "off", score: 40, configKey: "k" }),
    ]),
  ]);
  const payload = balanceExportPayload(data);
  assert.equal(payload.sessions[0]?.trials[0]?.score, 50);
  assert.equal(payload.sessions[0]?.trials[0]?.configKey, "k");
  const bolt = payload.autoStrengthByBall.find((row) => row.ballId === "bolt");
  assert.ok(bolt);
  assert.equal(bolt.label, "自动 S：—（开技能 0/10，关技能 1/10，基准 1/10）");
  assert.equal("auto" in bolt, false);

  const text = csv(data).replace(/^\uFEFF/, "");
  const [header, line] = text.split("\n");
  assert.ok(header?.startsWith("sessionId,ballId,skillState,score,"));
  assert.ok(header?.endsWith("会话球,自动S,自动S状态,得分分项,容错分项,节奏分项,爆发分项,代价分项,代价状态,基准局数,开技能局数,关技能局数,自动S说明"));
  assert.match(line ?? "", /自动 S：—（开技能 0\/10，关技能 1\/10，基准 1\/10）/);
});
