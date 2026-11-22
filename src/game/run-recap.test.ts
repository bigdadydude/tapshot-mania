import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecapTracker,
  formatRecapDuration,
  noteRecapClick,
  noteRecapClock,
  noteRecapHold,
  noteRecapMake,
  noteRecapMiss,
  noteRecapPeakCombo,
  noteRecapPrisonFree,
  noteRecapSkillInput,
  noteRecapSkillTime,
  noteRecapTrafficAbsorbs,
  noteRecapTrafficBurns,
  noteRecapTrafficNearMiss,
  recapRows,
  resetRecapTracker,
  shouldRecordBalanceTrial,
  snapshotRunRecap,
  syncBirdRecap,
  watchBirds,
} from "./run-recap.ts";

function context(partial: Partial<Parameters<typeof snapshotRunRecap>[1]> = {}) {
  return {
    playMode: "classic" as const,
    ballId: "plain" as const,
    ballLabel: "经典球",
    sceneId: "street" as const,
    gameRev: 332,
    score: 40,
    ...partial,
  };
}

test("normal plays accumulate recap stats without a balance session", () => {
  const t = createRecapTracker();
  noteRecapClick(t, true);
  noteRecapClick(t, true);
  noteRecapClick(t, false);
  noteRecapHold(t, true);
  noteRecapHold(t, false);
  noteRecapSkillInput(t, true);
  noteRecapMiss(t, true, false);
  noteRecapMiss(t, true, true);
  noteRecapMiss(t, false, false);
  noteRecapMake(t, { streak: 3, awarded: 8, clutch: false });
  noteRecapMake(t, { streak: 4, awarded: 12, clutch: true });
  noteRecapClock(t, 1.25);
  noteRecapClock(t, 0.5);
  noteRecapSkillTime(t, 0.4, { busy: true });
  noteRecapSkillTime(t, 0.2, { locked: true });
  noteRecapPeakCombo(t, 2);

  assert.equal(t.clicks, 2);
  assert.equal(t.holds, 1);
  assert.equal(t.skillInputs, 1);
  assert.equal(t.misses, 1);
  assert.equal(t.makes, 2);
  assert.equal(t.peakCombo, 4);
  assert.equal(t.peakMake, 12);
  assert.equal(t.clutchMakes, 1);
  assert.equal(t.clockSeconds, 1.75);
  assert.equal(t.skillActiveSeconds, 0.4);
  assert.equal(t.skillLockSeconds, 0.2);
});

test("snapshot at the end includes standing recap fields", () => {
  const t = createRecapTracker();
  noteRecapClick(t, true);
  noteRecapMake(t, { streak: 2, awarded: 5, clutch: false });
  noteRecapClock(t, 45.21);
  const recap = snapshotRunRecap(t, context({ score: 18, playMode: "minute", sceneId: "overpass", ballLabel: "闪电球" }));
  assert.equal(recap.playMode, "minute");
  assert.equal(recap.ballId, "plain");
  assert.equal(recap.ballLabel, "闪电球");
  assert.equal(recap.sceneId, "overpass");
  assert.equal(recap.sceneLabel, "都市");
  assert.equal(recap.gameRev, 332);
  assert.equal(recap.score, 18);
  assert.equal(recap.peakCombo, 2);
  assert.equal(recap.peakMake, 5);
  assert.equal(recap.durationSeconds, 45.21);
  assert.equal(recap.makes, 1);
  assert.equal(recap.misses, 0);
  assert.equal(recap.clicks, 1);
  assert.equal(recap.holds, 0);
  assert.equal(recap.skillInputs, 0);
  assert.equal(recap.skillActiveSeconds, 0);
  assert.equal(recap.skillLockSeconds, 0);
  assert.equal(recap.clutchMakes, 0);
  assert.deepEqual(recap.map, {});
});

test("recap rows hide optional lines until real counts exist", () => {
  const empty = snapshotRunRecap(createRecapTracker(), context());
  const labels = recapRows(empty).map((row) => row.label);
  assert.deepEqual(labels, [
    "模式",
    "球种",
    "地图",
    "版本",
    "分数",
    "最高连击",
    "最高单次得分",
    "时长",
    "进球",
    "不中",
    "点击次数",
    "长按次数",
    "技能使用",
  ]);
  assert.equal(recapRows(empty).find((row) => row.label === "版本")?.value, "r332");
  assert.equal(recapRows(empty).find((row) => row.label === "模式")?.value, "经典");
  assert.equal(recapRows(empty).find((row) => row.label === "地图")?.value, "街头");
  assert.equal(labels.includes("绝杀球数"), false);
  assert.equal(labels.includes("技能持续时间"), false);
  assert.equal(labels.includes("技能锁定时间"), false);
  assert.equal(labels.includes("擦车而过"), false);
  assert.equal(labels.includes("击晕飞鸟"), false);
  assert.equal(labels.includes("释放次数"), false);

  const t = createRecapTracker();
  noteRecapMake(t, { streak: 6, awarded: 20, clutch: true });
  noteRecapSkillTime(t, 1.25, { busy: true, locked: true });
  noteRecapTrafficNearMiss(t, 2);
  noteRecapTrafficBurns(t, 1);
  noteRecapTrafficAbsorbs(t, 3);
  syncBirdRecap(t, { kills: 4, absorbed: 1, iceBreaks: 2 });
  noteRecapPrisonFree(t);
  const filled = recapRows(snapshotRunRecap(t, context()));
  const filledLabels = filled.map((row) => row.label);
  assert.equal(filled.find((row) => row.label === "绝杀球数")?.value, "1");
  assert.equal(filled.find((row) => row.label === "技能持续时间")?.value, "1.3 秒");
  assert.equal(filled.find((row) => row.label === "技能锁定时间")?.value, "1.3 秒");
  assert.equal(filled.find((row) => row.label === "擦车而过")?.value, "2");
  assert.equal(filled.find((row) => row.label === "烧毁车辆")?.value, "1");
  assert.equal(filled.find((row) => row.label === "吸收车辆")?.value, "3");
  assert.equal(filled.find((row) => row.label === "击晕飞鸟")?.value, "4");
  assert.equal(filled.find((row) => row.label === "吸收飞鸟")?.value, "1");
  assert.equal(filled.find((row) => row.label === "击碎冰鸟")?.value, "2");
  assert.equal(filled.find((row) => row.label === "释放次数")?.value, "1");
  assert.ok(filledLabels.includes("绝杀球数"));
});

test("rogue recap omits peak rows already shown in the run summary", () => {
  const t = createRecapTracker();
  noteRecapMake(t, { streak: 8, awarded: 30, clutch: false });
  const recap = snapshotRunRecap(t, context({ playMode: "rogue" }));
  const labels = recapRows(recap, { hideRogueDuplicates: true }).map((row) => row.label);
  assert.equal(labels.includes("最高连击"), false);
  assert.equal(labels.includes("最高单次得分"), false);
  assert.ok(labels.includes("分数"));
  assert.ok(labels.includes("进球"));
  assert.equal(recapRows(recap).some((row) => row.label === "最高连击"), true);
});

test("bird watch keeps run totals across a fresh wave", () => {
  const t = createRecapTracker();
  syncBirdRecap(t, { kills: 2, absorbed: 1, iceBreaks: 0 });
  watchBirds(t);
  syncBirdRecap(t, { kills: 1, absorbed: 0, iceBreaks: 1 });
  assert.equal(t.birdStuns, 3);
  assert.equal(t.birdAbsorbs, 1);
  assert.equal(t.birdIceBreaks, 1);
});

test("reset clears run totals for a new match", () => {
  const t = createRecapTracker();
  noteRecapClick(t, true);
  noteRecapMake(t, { streak: 3, awarded: 9, clutch: true });
  resetRecapTracker(t);
  assert.deepEqual(t, createRecapTracker());
});

test("duration uses the accumulated match clock and a readable format", () => {
  assert.equal(formatRecapDuration(0), "0.0 秒");
  assert.equal(formatRecapDuration(45.21), "45.2 秒");
  assert.equal(formatRecapDuration(60), "1:00.0");
  assert.equal(formatRecapDuration(65.2), "1:05.2");
});

test("balance trials still record only under the original conditions", () => {
  const ready = {
    hasSession: true,
    devOn: true,
    minuteMode: true,
    timerArmed: true,
    alreadyRecorded: false,
  };
  assert.equal(shouldRecordBalanceTrial(ready), true);
  assert.equal(shouldRecordBalanceTrial({ ...ready, hasSession: false }), false);
  assert.equal(shouldRecordBalanceTrial({ ...ready, devOn: false }), false);
  assert.equal(shouldRecordBalanceTrial({ ...ready, minuteMode: false }), false);
  assert.equal(shouldRecordBalanceTrial({ ...ready, timerArmed: false }), false);
  assert.equal(shouldRecordBalanceTrial({ ...ready, alreadyRecorded: true }), false);
});
