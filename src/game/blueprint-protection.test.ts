import assert from "node:assert/strict";
import test from "node:test";
import { resolveComboBreak, type ComboBreakState } from "./combo-break.ts";
import {
  BLUEPRINT_RAISE, BLUEPRINT_COMBO_FLASH_SECONDS, blueprintRewardPool, blueprintRewardToast,
  getBlueprintClock, restoreBlueprintClock, resetBlueprint, resetBlueprintProgress,
  consumeBlueprintComboProtection, getBlueprintComboProtection, blueprintComboFlashAlpha,
  touchBlueprintCell, stepBlueprint, drainBlueprintRewardEvents, drawBlueprintRewardHints,
} from "./blueprint.ts";
const world = { w: 390, h: 844, floorY: 844 * 0.765, ballR: 19.5, hoopInner: 27.69 };
const aim = { goals: 9, ballX: -400, ballY: -400, hoopX: 195, hoopY: 200 };
function charges(n: number) {
  resetBlueprint(1);
  restoreBlueprintClock({ ...getBlueprintClock(), goals: 9, comboProtectionCharges: n });
}
function state(partial: Partial<ComboBreakState> = {}): ComboBreakState {
  return { mode: "classic", blueprint: true, buzzer: false, streak: 5, combo: 5, comboCounting: true,
    rogueRun: false, pendingPaid: false, paidCharges: 0, rogueSaved: false, ...partial };
}

test("三模式各断连来源共用决策：有效连击优先免费保住，不落到付费分支", () => {
  for (const mode of ["classic", "minute", "rogue"] as const) {
    for (const reason of ["timeout", "settledMissJump", "spentRescueJump"]) {
      charges(2);
      const paid = 2;
      const action = resolveComboBreak(state({ mode, rogueRun: mode === "rogue", paidCharges: paid }), consumeBlueprintComboProtection);
      assert.equal(action, "blueprint", `${mode}/${reason}`);
      assert.equal(getBlueprintComboProtection(), 1);
      assert.equal(paid, 2);
      assert.notEqual(action, "paidPrompt");
      assert.equal(getBlueprintClock().comboProtectionFlash, BLUEPRINT_COMBO_FLASH_SECONDS);
    }
  }
});

test("绝杀/无效/无当前连击/非蓝图不消耗，免费耗尽后原肉鸽询问及保护顺序不变", () => {
  for (const mode of ["classic", "minute", "rogue"] as const) {
    for (const invalid of [
      { buzzer: true }, { streak: 0, combo: 0, comboCounting: false },
      { streak: 0, combo: 0, comboCounting: true }, { streak: 0, combo: 8, comboCounting: false }, { blueprint: false },
    ]) {
      charges(1);
      assert.notEqual(resolveComboBreak(state({ ...invalid, mode }), consumeBlueprintComboProtection), "blueprint");
      assert.equal(getBlueprintComboProtection(), 1);
      assert.equal(getBlueprintClock().comboProtectionFlash, 0);
    }
  }
  charges(0);
  assert.equal(resolveComboBreak(state({ mode: "rogue", rogueRun: true, paidCharges: 1, rogueSaved: true }), consumeBlueprintComboProtection), "paidPrompt");
  assert.equal(resolveComboBreak(state({ mode: "rogue", rogueRun: true, pendingPaid: true, paidCharges: 1, rogueSaved: true }), consumeBlueprintComboProtection), "rogueSaved");
  assert.equal(resolveComboBreak(state({ mode: "rogue", rogueRun: true, paidCharges: 0 }), consumeBlueprintComboProtection), "break");
});

test("actual9起三模式奖池每绿只抽一项，保护每次+1最多3，获取不闪", () => {
  assert.ok(!blueprintRewardPool(true, 8).includes("comboProtection"));
  for (const clock of [true, false]) assert.ok(blueprintRewardPool(clock, 9).includes("comboProtection"));
  assert.equal(blueprintRewardToast("comboProtection"), "连击保护 +1次");
  let seed = 0;
  for (let candidate = 1; candidate <= 100; candidate++) {
    charges(0);
    restoreBlueprintClock({ ...getBlueprintClock(), seed: candidate, staticAge: BLUEPRINT_RAISE, staticCells: [{ col: 5, row: 9, kind: "green" }] });
    touchBlueprintCell(world, 5, 9);
    const events = drainBlueprintRewardEvents();
    assert.equal(events.length, 1);
    if (events[0] === "comboProtection") { seed = candidate; break; }
  }
  assert.ok(seed > 0);
  charges(0);
  for (let i = 1; i <= 5; i++) {
    const before = getBlueprintClock();
    restoreBlueprintClock({ ...before, seed, rewardSerial: 0, staticAge: BLUEPRINT_RAISE,
      staticCells: [{ col: 5, row: 9, kind: "green" }], clearing: [] });
    touchBlueprintCell(world, 5, 9);
    assert.deepEqual(drainBlueprintRewardEvents(), ["comboProtection"]);
    assert.equal(getBlueprintComboProtection(), Math.min(3, i));
    assert.equal(getBlueprintClock().comboProtectionFlash, 0);
    assert.equal(blueprintComboFlashAlpha(), 0);
    assert.deepEqual(getBlueprintClock().rewards, before.rewards, "no match-clock/base/combo increment from protection reward");
  }
});

test("次数及短闪随回溯，保护只在实际消耗后短闪并自动结束，新局清零，同肉鸽换关保留次数", () => {
  charges(3);
  const before = getBlueprintClock();
  assert.equal(consumeBlueprintComboProtection(), true);
  stepBlueprint(0.2, true, aim, world);
  assert.ok(blueprintComboFlashAlpha() > 0);
  const after = getBlueprintClock();
  restoreBlueprintClock(before);
  assert.equal(getBlueprintComboProtection(), 3);
  assert.equal(blueprintComboFlashAlpha(), 0);
  restoreBlueprintClock(after);
  assert.equal(getBlueprintComboProtection(), 2);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  stepBlueprint(1, true, aim, world);
  assert.equal(blueprintComboFlashAlpha(), 0);
  assert.equal(getBlueprintClock().comboProtectionFlash, 0);
  resetBlueprintProgress(true);
  assert.equal(getBlueprintComboProtection(), 2);
  resetBlueprintProgress();
  assert.equal(getBlueprintComboProtection(), 0);
  assert.equal(consumeBlueprintComboProtection(), false);
  assert.equal(blueprintComboFlashAlpha(), 0);
  charges(2); resetBlueprint();
  assert.equal(getBlueprintComboProtection(), 0);
});

test("真实蓝图提示入口持续显示次数，消费更新，不挪连击文本", () => {
  charges(2);
  const text: string[] = [];
  const ctx = { globalAlpha: 1, font: "", fillStyle: "", textAlign: "", textBaseline: "", save() {}, restore() {},
    fillText(value: string) { text.push(value); } } as unknown as CanvasRenderingContext2D;
  drawBlueprintRewardHints(ctx, world, 0);
  assert.deepEqual(text, ["连击保护×2"]);
  consumeBlueprintComboProtection(); text.length = 0;
  drawBlueprintRewardHints(ctx, world, 0);
  assert.deepEqual(text, ["连击保护×1"]);
  consumeBlueprintComboProtection(); text.length = 0;
  drawBlueprintRewardHints(ctx, world, 0);
  assert.deepEqual(text, []);
});
