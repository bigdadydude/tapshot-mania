import assert from "node:assert/strict";
import test from "node:test";
import { getScene, SCENE_LABELS, setScene } from "./scenes.ts";
import {
  BLUEPRINT_DEFAULT_FLOOR_SPREAD, BLUEPRINT_DEFAULT_FLOOR_DENSITY,
  getBlueprintFloorSpread, setBlueprintFloorSpread,
  getBlueprintFloorDensity, setBlueprintFloorDensity, blueprintMajorColumn,
  BLUEPRINT_BALL_CLEAR,
  BLUEPRINT_LIT_RGB,
  BLUEPRINT_RED_RGB,
  BLUEPRINT_CLOCK_SECONDS,
  BLUEPRINT_KIND_WEIGHTS,
  BLUEPRINT_KIND_UNLOCK,
  BLUEPRINT_REWARD_UNLOCK,
  BLUEPRINT_BLACK,
  BLUEPRINT_TURN_RED_DELTAS,
  blueprintRewardPool,
  blueprintRewardToast,
  blueprintCountSoftMax,
  blueprintKindWeights,
  blueprintTurnRedNeighbors,
  blueprintAreaNeighbors,
  blueprintRedCrossCells,
  blueprintCellLocked,
  blueprintLockedLines,
  applyBlueprintTurnRed,
  applyBlueprintScoreDouble,
  getBlueprintScoreDoubleCharges,
  getBlueprintRewards,
  drainBlueprintRewardEvents,
  getBlueprintAllowSeconds,
  setBlueprintAllowSeconds,
  blueprintHudClockBudget,
  blueprintAppliesClockReward,
  resetBlueprintProgress,
  BLUEPRINT_BLOCK_SIZE,
  BLUEPRINT_BOUNCE_CLEAR,
  BLUEPRINT_DESPAWN_BASE,
  BLUEPRINT_DESPAWN_CAP,
  BLUEPRINT_DESPAWN_PER_GOAL,
  BLUEPRINT_FLOOR_SPREAD,
  BLUEPRINT_HIT_EXTEND,
  BLUEPRINT_MAX_COUNT,
  BLUEPRINT_MAX_LIGHTNESS,
  BLUEPRINT_CROSS_RAISE,
  BLUEPRINT_RAISE,
  BLUEPRINT_SHAPES,
  blueprintBlockSize,
  blueprintBlocks,
  blueprintBlockStrokeRect,
  blueprintCellCover,
  blueprintCellPixels,
  blueprintDespawnChance,
  blueprintDynamicCellExtend,
  blueprintDynamicProgress,
  blueprintClearExtend,
  blueprintExtend,
  blueprintFieldCells,
  blueprintFillAlpha,
  blueprintFloorDepthX,
  blueprintFloorRowY,
  blueprintGrid,
  blueprintHudBar,
  blueprintJumpClearY,
  blueprintLegalCells,
  blueprintPlayfieldTop,
  blueprintNearBall,
  blueprintOnShotPath,
  blueprintProtrudingCells,
  blueprintQuota,
  blueprintColClears,
  blueprintRowClears,
  blueprintSampleCount,
  blueprintShadowAlpha,
  blueprintShadowBox,
  clipBlueprintPaintBox,
  blueprintShadowCast,
  blueprintShadowHead,
  blueprintShadowKeep,
  blueprintShadowPieces,
  blueprintShapeOffsets,
  blueprintStamp,
  blueprintTranslateCells,
  blueprintVanishingPoint,
  clipBlueprintCells,
  claimBlueprintBonus,
  claimBlueprintBonusForBasket,
  consumeBlueprintLitForHole,
  settleBlueprintBasket,
  collideBlueprint,
  drawBlueprint,
  getBlueprintClock,
  resetBlueprint,
  restoreBlueprintClock,
  rollBlueprintBatch,
  stepBlueprint,
  touchBlueprintCell,
  type BlueprintCellRef,
  type BlueprintClock,
  type BlueprintDynamic,
} from "./blueprint.ts";

function makeWorld(w = 390, h = 844) {
  const ballR = Math.max(17, Math.min(w, h) * 0.05);
  return { w, h, floorY: h * 0.765, ballR, hoopInner: Math.max(22, ballR * 1.42) };
}

const world = makeWorld();
// Legacy geometry checks explicitly exercise the original 100% calibration.
setBlueprintFloorDensity(1);
setBlueprintFloorSpread(1);

function clock(partial: Partial<BlueprintClock> & { cells?: BlueprintCellRef[]; cycle?: number } = {}): BlueprintClock {
  const {
    cells: legacyCells,
    cycle: legacyCycle,
    duration: legacyDuration,
    staticCells: staticCellsOpt,
    staticAge: staticAgeOpt,
    staticRaise: staticRaiseOpt,
    lit: litOpt,
    pendingBonus: bonusOpt,
    clearing: clearingOpt,
    ...rest
  } = partial;
  const staticCells = staticCellsOpt ?? legacyCells ?? [];
  const staticAge = staticAgeOpt ?? legacyCycle ?? 0;
  const staticRaise = staticRaiseOpt ?? legacyDuration ?? BLUEPRINT_RAISE;
  return {
    seed: 1,
    elapsed: 0,
    goals: 1,
    serial: 1,
    dynamic: null,
    ...rest,
    staticCells,
    staticAge,
    staticRaise,
    cells: staticCells,
    cycle: staticAge,
    duration: staticRaise,
    lit: litOpt ?? [],
    pendingBonus: bonusOpt ?? 0,
    clearing: clearingOpt ?? [],
  };
}

function dyn(partial: Partial<BlueprintDynamic> & Pick<BlueprintDynamic, "cells">): BlueprintDynamic {
  return {
    pending: [],
    dir: 0,
    phase: "hold",
    age: 0,
    stepSpan: 0.5,
    raise: BLUEPRINT_RAISE,
    ...partial,
  };
}

function cellRect(ref: BlueprintCellRef, sample = world) {
  const grid = blueprintGrid(sample);
  return {
    x: grid.ox + ref.col * grid.size,
    y: grid.oy + ref.row * grid.size,
    w: grid.size,
    h: grid.size,
  };
}

function aimAt(goals: number, sample = world) {
  return {
    goals,
    ballX: sample.w * 0.5,
    ballY: sample.floorY - sample.ballR,
    hoopX: sample.hoopInner + sample.w * 0.1,
    hoopY: sample.h * 0.36,
  };
}

function raisedCell() {
  for (let serial = 0; serial < 20; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 1, serial, goals: 3, ball: null, hoop: null });
    if (batch.cells[0]) return batch.cells[0];
  }
  throw new Error("no legal blueprint cell");
}

test("同时凸出不超过 10 格", () => {
  assert.equal(BLUEPRINT_MAX_COUNT, 10);
  assert.equal(blueprintQuota(0), 0);
  assert.equal(blueprintQuota(1), 1);
  assert.equal(blueprintQuota(10), 10);
  assert.equal(blueprintQuota(11), 10);
  assert.equal(blueprintQuota(99.9), 10);
  const many = Array.from({ length: 12 }, (_, i) => ({ col: i, row: 0 }));
  assert.equal(clipBlueprintCells(many, () => true).length, 10);
  const shot = aimAt(8);
  for (let serial = 0; serial < 40; serial++) {
    const batch = rollBlueprintBatch(world, {
      seed: 3,
      serial,
      goals: Math.max(1, serial),
      ball: { x: shot.ballX, y: shot.ballY },
      hoop: { x: shot.hoopX, y: shot.hoopY },
    });
    assert.ok(batch.cells.length <= BLUEPRINT_MAX_COUNT);
    const blocks = blueprintBlocks(world, clock({ cells: batch.cells, goals: Math.max(1, serial), cycle: batch.duration, duration: batch.duration }));
    assert.ok(blocks.length <= BLUEPRINT_MAX_COUNT);
  }
});

test("前 3 球没有方块；第 3 球起 1 格；上限扩大后可抽到更多格", () => {
  assert.equal(BLUEPRINT_RAISE, 0.35);
  for (const goals of [0, 1, 2]) {
    assert.equal(blueprintSampleCount(goals, 0), 0);
    assert.equal(blueprintSampleCount(goals, 1), 0);
    assert.equal(rollBlueprintBatch(world, { seed: 2, serial: 0, goals, ball: null, hoop: null }).cells.length, 0);
  }
  for (let serial = 0; serial < 24; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 7, serial, goals: 3, ball: null, hoop: null });
    assert.equal(batch.cells.length, 1);
    assert.equal(batch.duration, BLUEPRINT_RAISE);
  }
  let multiAtLow = 0;
  let multiAtHigh = 0;
  const samples = 80;
  for (let serial = 0; serial < samples; serial++) {
    if (blueprintSampleCount(6, serial / samples) > 1) multiAtLow += 1;
    if (blueprintSampleCount(16, serial / samples) > 1) multiAtHigh += 1;
  }
  assert.ok(multiAtHigh > multiAtLow, `high=${multiAtHigh} low=${multiAtLow}`);
  assert.ok(multiAtHigh > samples * 0.3);
  assert.equal(blueprintExtend(0, BLUEPRINT_RAISE), 0);
  assert.ok(blueprintExtend(BLUEPRINT_RAISE / 2, BLUEPRINT_RAISE) > 0.4);
  assert.equal(blueprintExtend(BLUEPRINT_RAISE, BLUEPRINT_RAISE), 1);
  assert.equal(blueprintExtend(BLUEPRINT_RAISE * 8, BLUEPRINT_RAISE), 1);
});

test("进球前空场；每次进球换批并保持到下一次进球", () => {
  resetBlueprint(4);
  const aim = aimAt(0);
  stepBlueprint(0.016, true, aim, world);
  const idle = getBlueprintClock();
  assert.equal(idle.goals, 0);
  assert.equal(idle.cells.length, 0);
  assert.equal(idle.staticCells.length, 0);
  assert.equal(idle.dynamic, null);
  assert.equal(blueprintBlocks(world, idle).length, 0);
  stepBlueprint(0.5, true, { ...aim, goals: 0 }, world);
  assert.equal(getBlueprintClock().cells.length, 0);

  stepBlueprint(0.016, true, { ...aim, goals: 1 }, world);
  assert.equal(getBlueprintClock().goals, 1);
  assert.equal(getBlueprintClock().staticCells.length, 0);
  stepBlueprint(0.016, true, { ...aim, goals: 2 }, world);
  assert.equal(getBlueprintClock().goals, 2);
  assert.equal(getBlueprintClock().staticCells.length, 0);
  assert.equal(getBlueprintClock().dynamic, null);

  stepBlueprint(0.016, true, { ...aim, goals: 3 }, world);
  const first = getBlueprintClock();
  assert.equal(first.goals, 3);
  assert.equal(first.staticCells.length, 1);
  assert.equal(first.cells.length, 1);
  assert.equal(first.staticRaise, BLUEPRINT_RAISE);
  stepBlueprint(2, true, { ...aim, goals: 3 }, world);
  const held = getBlueprintClock();
  assert.deepEqual(held.staticCells, first.staticCells);
  assert.equal(held.serial, first.serial);
  assert.ok(held.staticAge > BLUEPRINT_RAISE);
  assert.equal(blueprintExtend(held.staticAge, held.staticRaise), 1);

  stepBlueprint(0.016, true, { ...aim, goals: 4 }, world);
  const next = getBlueprintClock();
  assert.equal(next.goals, 4);
  assert.equal(next.serial, first.serial + 1);
  assert.ok(next.staticAge < 0.05);
  assert.ok(next.staticCells.length >= 1);
});

test("动态可以踩在静态上，重叠格仍跟整组一起伸缩", () => {
  assert.deepEqual(blueprintTranslateCells([{ col: 3, row: 4 }], 0), [{ col: 4, row: 4 }]);
  assert.deepEqual(blueprintTranslateCells([{ col: 3, row: 4 }], 3), [{ col: 3, row: 3 }]);
  assert.equal(BLUEPRINT_CROSS_RAISE, 0.2);
  assert.ok(Math.abs(blueprintDynamicProgress(BLUEPRINT_CROSS_RAISE / 2, BLUEPRINT_CROSS_RAISE) - 0.5) < 1e-9);
  const legal = blueprintLegalCells(world, null);
  const keys = new Set(legal.map((cell) => `${cell.col}:${cell.row}`));
  const line = legal
    .map((cell) => [0, 1, 2, 3].map((i) => ({ col: cell.col + i, row: cell.row })))
    .find((cells) => cells.every((cell) => keys.has(`${cell.col}:${cell.row}`)));
  assert.ok(line);
  const [left, mid, landed] = line!;
  const staticKeys = new Set([`${landed!.col}:${landed!.row}`]);
  const sinking = dyn({
    cells: [left!, mid!],
    pending: [mid!, landed!],
    dir: 0,
    phase: "cross_out",
    age: BLUEPRINT_CROSS_RAISE / 2,
    raise: BLUEPRINT_CROSS_RAISE,
  });
  const onStatic = blueprintDynamicCellExtend(sinking, mid!, staticKeys);
  const beside = blueprintDynamicCellExtend(sinking, left!, staticKeys);
  assert.ok(Math.abs(onStatic - beside) < 1e-9);
  assert.ok(Math.abs(onStatic - 0.5) < 1e-9);

  const stacked = clock({
    goals: 3,
    staticCells: [landed!],
    staticAge: BLUEPRINT_RAISE,
    staticRaise: BLUEPRINT_RAISE,
    dynamic: dyn({
      cells: [mid!, landed!],
      phase: "cross_in",
      age: BLUEPRINT_CROSS_RAISE / 2,
      raise: BLUEPRINT_CROSS_RAISE,
    }),
  });
  const blocks = blueprintBlocks(world, stacked);
  const dynBlocks = blocks.filter((block) => block.dynamic);
  assert.equal(dynBlocks.length, 2);
  assert.ok(dynBlocks.every((block) => Math.abs(block.extend - dynBlocks[0]!.extend) < 1e-9));
  assert.ok(Math.abs(dynBlocks[0]!.extend - 0.5) < 1e-9);
  const overlap = dynBlocks.find((block) => block.col === landed!.col && block.row === landed!.row);
  assert.ok(overlap);
  const under = blocks.find((block) => !block.dynamic && block.col === landed!.col && block.row === landed!.row);
  assert.ok(under && under.extend > 0.95);
  assert.ok(Math.max(overlap!.extend, under!.extend) > 0.95);

  const aim = { goals: 4, ballX: -400, ballY: -400, hoopX: world.w * 0.2, hoopY: world.h * 0.3 };
  restoreBlueprintClock(clock({
    goals: 4,
    seed: 3,
    staticCells: [landed!],
    staticAge: BLUEPRINT_RAISE,
    dynamic: dyn({
      cells: [left!, mid!],
      dir: 0,
      phase: "hold",
      age: 0.49,
      stepSpan: 0.5,
    }),
  }));
  stepBlueprint(0.02, true, aim, world);
  const moving = getBlueprintClock();
  assert.ok(moving.dynamic);
  assert.equal(moving.dynamic!.phase, "cross_out");
  assert.equal(moving.dynamic!.dir, 0);
  assert.equal(moving.dynamic!.cells.length, 2);
  assert.deepEqual(moving.dynamic!.pending, [mid!, landed!]);
  stepBlueprint(BLUEPRINT_CROSS_RAISE, true, aim, world);
  const arrived = getBlueprintClock();
  assert.equal(arrived.dynamic?.phase, "cross_in");
  assert.deepEqual(arrived.dynamic?.cells, [mid!, landed!]);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  const rising = blueprintBlocks(world).filter((block) => block.dynamic);
  assert.equal(rising.length, 2);
  assert.ok(rising.every((block) => Math.abs(block.extend - rising[0]!.extend) < 1e-9));
  assert.ok(rising.some((block) => block.col === landed!.col && block.row === landed!.row));
});

test("进球换静态不裁掉踩在上面的动态格", () => {
  const aim = aimAt(9);
  let saw = false;
  for (let s = 1; s < 80 && !saw; s++) {
    resetBlueprint(s);
    stepBlueprint(0, true, aim, world);
    const before = getBlueprintClock();
    const opts = {
      seed: before.seed,
      serial: before.serial + 1,
      goals: 10,
      ball: { x: aim.ballX, y: aim.ballY },
      hoop: { x: aim.hoopX, y: aim.hoopY },
    };
    const target = rollBlueprintBatch(world, opts).target;
    // 预测静态选位也必须先扣掉两格动态占用，不能拿整批目标来猜静态形状。
    if (target <= 2) continue;
    const next = rollBlueprintBatch(world, { ...opts, maxCount: target - 2, want: target - 2 });
    const hit = next.cells[0];
    if (!hit) continue;
    const group = [hit, { col: hit.col + 1, row: hit.row }];
    restoreBlueprintClock({
      ...before,
      dynamic: dyn({ cells: group, phase: "hold", age: 0.2 }),
    });
    stepBlueprint(0, true, aimAt(10), world);
    const after = getBlueprintClock();
    if (!after.dynamic) continue;
    const staticKeys = new Set(after.staticCells.map((cell) => `${cell.col}:${cell.row}`));
    if (!staticKeys.has(`${hit.col}:${hit.row}`)) continue;
    assert.deepEqual(after.dynamic.cells, group);
    saw = true;
  }
  assert.equal(saw, true);
});

test("动态挪移整组同步：先一起缩回，再一起升起", () => {
  const legal = blueprintLegalCells(world, null);
  const byRow = new Map<number, { col: number; row: number }[]>();
  for (const cell of legal) {
    const list = byRow.get(cell.row) ?? [];
    list.push({ col: cell.col, row: cell.row });
    byRow.set(cell.row, list);
  }
  let strip: { col: number; row: number }[] | null = null;
  for (const list of byRow.values()) {
    list.sort((a, b) => a.col - b.col);
    for (let i = 0; i + 2 < list.length; i++) {
      const a = list[i]!, b = list[i + 1]!, c = list[i + 2]!;
      if (b.col === a.col + 1 && c.col === a.col + 2) {
        strip = [a, b, c];
        break;
      }
    }
    if (strip) break;
  }
  assert.ok(strip);
  const [a, b, c] = strip!;
  const next = [{ col: a.col + 1, row: a.row }, { col: b.col + 1, row: b.row }, { col: c.col + 1, row: c.row }];
  const empty = new Set<string>();
  const sinking = dyn({
    cells: [a, b, c],
    pending: next,
    dir: 0,
    phase: "cross_out",
    age: BLUEPRINT_CROSS_RAISE / 2,
    raise: BLUEPRINT_CROSS_RAISE,
  });
  const e0 = blueprintDynamicCellExtend(sinking, a, empty);
  const e1 = blueprintDynamicCellExtend(sinking, b, empty);
  const e2 = blueprintDynamicCellExtend(sinking, c, empty);
  assert.equal(e0, e1);
  assert.equal(e1, e2);
  assert.ok(Math.abs(e0 - 0.5) < 1e-9);

  const rising = dyn({
    cells: next,
    pending: [],
    dir: 0,
    phase: "cross_in",
    age: BLUEPRINT_CROSS_RAISE / 2,
    raise: BLUEPRINT_CROSS_RAISE,
  });
  const r0 = blueprintDynamicCellExtend(rising, next[0]!, empty);
  const r1 = blueprintDynamicCellExtend(rising, next[1]!, empty);
  const r2 = blueprintDynamicCellExtend(rising, next[2]!, empty);
  assert.equal(r0, r1);
  assert.equal(r1, r2);
  assert.ok(Math.abs(r0 - 0.5) < 1e-9);

  const full = clock({
    goals: 4,
    staticCells: [],
    staticAge: BLUEPRINT_RAISE,
    dynamic: sinking,
  });
  const blocks = blueprintBlocks(world, full);
  const dynBlocks = blocks.filter((block) => block.dynamic);
  assert.equal(dynBlocks.length, 3);
  assert.ok(dynBlocks.every((block) => Math.abs(block.extend - e0) < 1e-6));
});

test("进球时动态消失概率随进球升高；静态+动态合计不超过 10", () => {
  assert.equal(BLUEPRINT_DESPAWN_BASE, 0.15);
  assert.equal(BLUEPRINT_DESPAWN_PER_GOAL, 0.08);
  assert.equal(BLUEPRINT_DESPAWN_CAP, 0.85);
  assert.equal(blueprintDespawnChance(0), 0);
  assert.equal(blueprintDespawnChance(1), 0.15);
  assert.ok(blueprintDespawnChance(5) > blueprintDespawnChance(2));
  assert.equal(blueprintDespawnChance(100), BLUEPRINT_DESPAWN_CAP);
  const legal = blueprintLegalCells(world, null);
  assert.ok(legal.length >= 12);
  const staticList = legal.slice(0, 6).map((cell) => ({ col: cell.col, row: cell.row }));
  const dynList = legal.slice(6, 12).map((cell) => ({ col: cell.col, row: cell.row }));
  const full = clock({
    goals: 8,
    staticCells: staticList,
    staticAge: BLUEPRINT_RAISE,
    dynamic: dyn({ cells: dynList, phase: "hold" }),
  });
  const blocks = blueprintBlocks(world, full);
  assert.ok(blocks.length <= BLUEPRINT_MAX_COUNT);
  assert.equal(blocks.filter((b) => !b.dynamic).length, 6);
  assert.equal(blocks.filter((b) => b.dynamic).length, 4);
});

test("进球换静态时可不杀动态", () => {
  const staticA = [{ col: 2, row: 3 }];
  const dynCells = [{ col: 6, row: 3 }];
  restoreBlueprintClock(clock({
    seed: 99,
    goals: 2,
    serial: 3,
    staticCells: staticA,
    staticAge: 1,
    dynamic: dyn({ cells: dynCells, phase: "hold", age: 0.2 }),
  }));
  const before = getBlueprintClock();
  assert.ok(before.dynamic);
  // 用极低消失种子路径：直接构造 keep——进球后若未消失则 dynamic 仍在。
  // 这里用 restore 模拟「未掷中消失」后的状态：静态已换、动态仍在。
  restoreBlueprintClock({
    ...before,
    goals: 3,
    serial: 4,
    staticCells: [{ col: 3, row: 5 }],
    staticAge: 0,
    cells: [{ col: 3, row: 5 }],
    cycle: 0,
    dynamic: before.dynamic,
  });
  const after = getBlueprintClock();
  assert.equal(after.goals, 3);
  assert.deepEqual(after.staticCells, [{ col: 3, row: 5 }]);
  assert.ok(after.dynamic);
  assert.deepEqual(after.dynamic!.cells, dynCells);
});

test("形状是直线、斜线、Z、L、S、U、V、C，裁剪后仍不超过 10", () => {
  assert.deepEqual([...BLUEPRINT_SHAPES], ["line", "diag", "z", "l", "s", "u", "v", "c"]);
  assert.equal(blueprintShapeOffsets("line", 1).length, 1);
  assert.ok(blueprintShapeOffsets("line", 1).every((cell) => cell.r === 0));
  assert.equal(blueprintShapeOffsets("line", 6).length, 6);
  assert.equal(blueprintShapeOffsets("diag", 4).length, 4);
  assert.deepEqual(blueprintShapeOffsets("z"), [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 1, r: 1 },
    { c: 2, r: 1 },
  ]);
  assert.equal(blueprintShapeOffsets("l").length, 4);
  assert.equal(blueprintShapeOffsets("s").length, 4);
  assert.equal(blueprintShapeOffsets("u").length, 7);
  assert.equal(blueprintShapeOffsets("v").length, 5);
  assert.equal(blueprintShapeOffsets("c").length, 7);
  for (const shape of BLUEPRINT_SHAPES) {
    assert.ok(blueprintShapeOffsets(shape, 6).length <= BLUEPRINT_MAX_COUNT);
  }
  const vertical = blueprintStamp("line", 4, 1, { col: 2, row: 3 });
  assert.equal(vertical.length, 4);
  assert.ok(vertical.every((cell) => cell.col === vertical[0]!.col));
  const stamped = blueprintStamp("line", 4, 0, { col: 0, row: 0 });
  assert.deepEqual(
    clipBlueprintCells(stamped, (col) => col !== 1).map((cell) => cell.col),
    [0, 2, 3],
  );
  const seen = new Set<string>();
  let single = false;
  let row = false;
  for (let serial = 0; serial < 80; serial++) {
    const goals = serial % 5 === 0 ? 3 : 16;
    const batch = rollBlueprintBatch(world, { seed: 11, serial, goals, ball: null, hoop: null });
    seen.add(batch.shape);
    assert.ok(batch.cells.length <= 10);
    if (!batch.anchor) continue;
    if (batch.cells.length === 1) {
      single = true;
      continue;
    }
    const pieceKeys = new Set<string>();
    for (const piece of batch.pieces) {
      const full = blueprintStamp(piece.shape, piece.length, piece.variant, piece.anchor);
      assert.ok(full.length <= BLUEPRINT_MAX_COUNT);
      const keys = new Set(full.map((cell) => `${cell.col}:${cell.row}`));
      for (const cell of piece.cells) {
        const key = `${cell.col}:${cell.row}`;
        assert.ok(keys.has(key));
        pieceKeys.add(key);
      }
    }
    for (const cell of batch.cells) assert.ok(pieceKeys.has(`${cell.col}:${cell.row}`));
    const sameRow = batch.cells.every((cell) => cell.row === batch.cells[0]!.row);
    const sameCol = batch.cells.every((cell) => cell.col === batch.cells[0]!.col);
    if (batch.cells.length >= 2 && (sameRow || sameCol)) row = true;
  }
  assert.ok(seen.size >= 4, `shapes seen: ${[...seen].join(",")}`);
  assert.equal(single, true);
  assert.equal(row, true);
});

test("选位避开篮筐走廊，也不落在篮球两格内", () => {
  const grid = blueprintGrid(world);
  const legal = blueprintLegalCells(world, null);
  assert.ok(legal.some((cell) => cell.y > blueprintJumpClearY(world)));
  const spot = legal[Math.floor(legal.length / 2)]!;
  const ball = { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2 };
  const hoop = { x: world.hoopInner + world.w * 0.1, y: world.h * 0.36 };
  const close = { x: ball.x - grid.size, y: ball.y - grid.size / 2, w: grid.size, h: grid.size };
  const far = { x: ball.x + grid.size * 3, y: ball.y - grid.size / 2, w: grid.size, h: grid.size };
  assert.equal(blueprintNearBall(world, close, ball), true);
  assert.equal(blueprintNearBall(world, far, ball), false);
  let sawPath = false;
  let sawIdle = false;
  for (let serial = 0; serial < 36; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 5, serial, goals: 16, ball, hoop });
    if (batch.mode === "path") sawPath = true;
    if (batch.mode === "idle") sawIdle = true;
    if (batch.mode === "path" && batch.anchor) {
      assert.equal(blueprintOnShotPath(world, cellRect(batch.anchor), ball, hoop), true);
    }
    for (const ref of batch.cells) {
      const rect = cellRect(ref);
      assert.equal(blueprintNearBall(world, rect, ball), false);
      assert.ok(Math.hypot(rect.x + rect.w / 2 - ball.x, rect.y + rect.h / 2 - ball.y) > BLUEPRINT_BALL_CLEAR * grid.size);
      assert.ok(rect.y >= world.h * 0.2);
      assert.ok(rect.y + rect.h <= world.floorY - world.ballR * 2.35 + 0.02);
      const left = world.hoopInner + world.w * 0.1;
      const right = world.w - world.hoopInner - world.w * 0.1;
      const reach = world.hoopInner + world.ballR * 1.35;
      const overlaps = (x: number) => rect.x < x + reach && rect.x + rect.w > x - reach;
      assert.equal(overlaps(left), false);
      assert.equal(overlaps(right), false);
    }
  }
  assert.equal(sawPath, true);
  assert.equal(sawIdle, true);
  for (const sample of [makeWorld(320, 700), makeWorld(500, 780), makeWorld(280, 620)]) {
    const placed = rollBlueprintBatch(sample, { seed: 3, serial: 2, goals: 3, ball: { x: sample.w * 0.5, y: sample.floorY - sample.ballR }, hoop: { x: sample.w * 0.2, y: sample.h * 0.4 } });
    for (const ref of placed.cells) {
      const rect = cellRect(ref, sample);
      assert.ok(rect.y + rect.h < sample.floorY - sample.ballR);
    }
  }
});

test("格子位置不动，升起后整格是墙，未升起时不挡球", () => {
  const ref = raisedCell();
  const span = BLUEPRINT_RAISE;
  assert.ok(blueprintExtend(0, span) < BLUEPRINT_HIT_EXTEND);
  assert.ok(Math.abs(blueprintExtend(span / 2, span) - 1) > 0.1);
  assert.equal(blueprintExtend(span, span), 1);
  assert.equal(blueprintExtend(span * 4, span), 1);
  const flat = blueprintBlocks(world, clock({ cells: [ref], cycle: 0, duration: span }))[0]!;
  const raised = blueprintBlocks(world, clock({ cells: [ref], cycle: span, duration: span }))[0]!;
  assert.equal(flat.dynamic, false);
  assert.equal(raised.dynamic, false);
  assert.deepEqual(flat.cell, raised.cell);
  assert.equal(flat.solid, null);
  assert.ok(flat.extend < BLUEPRINT_HIT_EXTEND);
  assert.deepEqual(raised.solid, raised.cell);
  assert.ok(raised.extend > 0.95);
});

test("球会被方块弹开，未升起时让路，也可以从上方跳过", () => {
  const ref = raisedCell();
  const full = clock({ cells: [ref], cycle: BLUEPRINT_RAISE, duration: BLUEPRINT_RAISE });
  restoreBlueprintClock(full);
  const target = blueprintBlocks(world, full)[0]!;
  assert.ok(target.solid);
  const y = target.cell.y + target.cell.h / 2;
  const side = { x: target.cell.x + 6, y, vx: 640, vy: 0, r: 14 };
  assert.equal(collideBlueprint(world, side, target.cell.x - 18, y, undefined, full), true);
  assert.ok(side.vx < 0);
  assert.ok(side.x + side.r <= target.cell.x + 1);

  const top = { x: target.cell.x + target.cell.w / 2, y: target.cell.y + 4, vx: 0, vy: 720, r: 14 };
  assert.equal(collideBlueprint(world, top, top.x, target.cell.y - 16, undefined, full), true);
  assert.ok(top.vy < 0);

  const overR = 12;
  const overY = target.cell.y - overR - 3;
  const over = { x: target.cell.x + target.cell.w - overR - 3, y: overY, vx: 180, vy: 0, r: overR };
  assert.equal(collideBlueprint(world, over, target.cell.x + overR + 3, overY, undefined, full), false);

  const inside = { x: target.cell.x + target.cell.w / 2, y: target.cell.y + target.cell.h / 2, vx: 0, vy: 0, r: 12 };
  const hidden = clock({ cells: [ref], cycle: 0, duration: BLUEPRINT_RAISE });
  restoreBlueprintClock(hidden);
  assert.ok(blueprintExtend(0, BLUEPRINT_RAISE) < 0.12);
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), false);
  restoreBlueprintClock(full);
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), true);
});

test("球落在凸出格子上会弹开，不会黏住，跳起来也不会被底边折返", () => {
  const g = world.h * 3.1;
  const dt = 1 / 60;
  const ref = raisedCell();
  const full = clock({ cells: [ref], cycle: BLUEPRINT_RAISE, duration: BLUEPRINT_RAISE });
  const target = blueprintBlocks(world, full)[0]!;
  const hop = Math.sqrt(2 * g * world.ballR * BLUEPRINT_BOUNCE_CLEAR);
  const ball = {
    x: target.cell.x + target.cell.w / 2,
    y: target.cell.y - world.ballR - 2,
    vx: 0,
    vy: 40,
    r: world.ballR,
  };
  let glued = 0;
  let left = false;
  for (let frame = 0; frame < 50; frame++) {
    const prevX = ball.x;
    const prevY = ball.y;
    ball.vy += g * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    collideBlueprint(world, ball, prevX, prevY, undefined, full);
    const onTop = Math.abs(ball.y - (target.cell.y - ball.r)) < 1.2 && ball.x > target.cell.x && ball.x < target.cell.x + target.cell.w;
    glued = onTop ? glued + 1 : 0;
    if (ball.x + ball.r < target.cell.x || ball.x - ball.r > target.cell.x + target.cell.w) left = true;
    assert.ok(glued < 8, `球在第 ${frame} 帧还贴在格子顶上`);
  }
  assert.equal(left, true);
  assert.ok(hop > g * dt, "最小弹起速度盖不过一帧重力");

  const rising = {
    x: target.cell.x + target.cell.w / 2,
    y: target.cell.y + 8,
    vx: 0,
    vy: -700,
    r: world.ballR,
  };
  assert.equal(collideBlueprint(world, rising, rising.x, rising.y + 4, undefined, full), true);
  assert.ok(rising.y + rising.r <= target.cell.y + 1, "起跳时应从格子上方离开");
  assert.ok(rising.vy < 0, "起跳速度不应被底边折成向下");
});

test("地面消失点在交线上方，交线处格子与墙面对齐", () => {
  const grid = blueprintGrid(world);
  assert.ok(Math.abs(grid.oy + grid.rows * grid.size - world.floorY) < 1e-6);
  const vp = blueprintVanishingPoint(world);
  assert.ok(world.floorY - vp.y > grid.size, `vp sits on the join: ${vp.y}`);
  const x0 = grid.ox + 2 * grid.size;
  const x1 = x0 + grid.size;
  assert.ok(Math.abs(blueprintFloorDepthX(world, x0, world.floorY) - x0) < 1e-6);
  const gapNear = blueprintFloorDepthX(world, x1, world.h) - blueprintFloorDepthX(world, x0, world.h);
  assert.ok(Math.abs(gapNear / grid.size - BLUEPRINT_FLOOR_SPREAD) < 0.05, `foreground pitch ${gapNear}`);
  const y1 = blueprintFloorRowY(world, 1);
  const y2 = blueprintFloorRowY(world, 2);
  assert.ok(Math.abs(y1 - (world.floorY + grid.size)) < 1e-4);
  assert.ok(y2 < world.h);
  assert.ok(y2 - y1 > y1 - world.floorY);
  const batch = rollBlueprintBatch(world, { seed: 1, serial: 0, goals: 3, ball: null, hoop: null });
  for (const block of blueprintBlocks(world, clock({ cells: batch.cells, goals: 3, cycle: BLUEPRINT_RAISE, duration: BLUEPRINT_RAISE }))) {
    const col = Math.round((block.cell.x - grid.ox) / grid.size);
    const row = Math.round((block.cell.y - grid.oy) / grid.size);
    assert.ok(Math.abs(block.cell.x - (grid.ox + col * grid.size)) < 1e-6);
    assert.ok(Math.abs(block.cell.y - (grid.oy + row * grid.size)) < 1e-6);
    assert.equal(block.cell.w, grid.size);
    assert.equal(block.cell.h, grid.size);
  }
});

test("墙面格子在屏幕上是正方形，地面透视格不是", () => {
  for (const sample of [world, makeWorld(450, 800), makeWorld(360, 780), makeWorld(393, 852)]) {
    const grid = blueprintGrid(sample);
    assert.equal(grid.size, blueprintBlockSize(sample));
    assert.equal(grid.size, Math.round(grid.size));
    const pitch = (origin: number, steps: number) => {
      const gaps: number[] = [];
      for (let i = 0; i < steps; i++) {
        gaps.push(Math.round(origin + (i + 1) * grid.size) - Math.round(origin + i * grid.size));
      }
      return gaps;
    };
    assert.deepEqual(pitch(grid.ox, grid.cols), Array(grid.cols).fill(grid.size));
    assert.deepEqual(pitch(grid.oy, grid.rows), Array(grid.rows).fill(grid.size));
    const y1 = blueprintFloorRowY(sample, 1);
    assert.ok(Math.abs((y1 - sample.floorY) - grid.size) < 1e-4);
    assert.equal(Math.round(y1) - Math.round(sample.floorY), grid.size);
    const x0 = grid.ox + 2 * grid.size;
    const near = blueprintFloorDepthX(sample, x0 + grid.size, y1) - blueprintFloorDepthX(sample, x0, y1);
    assert.ok(near > grid.size + 0.5, `floor cell should widen in perspective, near ${near}`);
  }
});

function pieceKeepAt(pieces: { x: number; y: number; w: number; h: number; keep: number }[], point: { x: number; y: number }) {
  const hit = pieces.find((piece) => point.x >= piece.x && point.x < piece.x + piece.w && point.y >= piece.y && point.y < piece.y + piece.h);
  return hit ? hit.keep : null;
}

test("网格更密，合法格铺在走廊之间", () => {
  assert.equal(BLUEPRINT_BLOCK_SIZE, 28);
  const grid = blueprintGrid(world);
  const legal = blueprintLegalCells(world, null);
  const cols = new Set(legal.map((cell) => cell.col));
  const jumpable = legal.filter((cell) => cell.y > blueprintJumpClearY(world));
  assert.ok(grid.cols >= 12, `cols ${grid.cols}`);
  assert.ok(grid.rows >= 20, `rows ${grid.rows}`);
  assert.ok(legal.length >= 60, `legal ${legal.length}`);
  assert.ok(cols.size >= 5, `columns ${cols.size}`);
  assert.ok(jumpable.length >= 8, `jumpable ${jumpable.length}`);
  assert.ok(jumpable.length < legal.length);
});

test("上方阴影落在下方凸出格上时随凸出减淡", () => {
  const size = BLUEPRINT_BLOCK_SIZE;
  const upper = { x: 100, y: 200, w: size, h: size };
  const lower = { x: 100, y: 200 + size, w: size, h: size };
  const extend = 1;
  const shadow = blueprintShadowBox(upper, extend);
  const cover = blueprintCellCover(lower);
  const cast = blueprintShadowCast(upper.h, extend);
  assert.equal(shadow.h, cast);
  assert.equal(cast, Math.max(4, Math.round(size * (0.28 + 1.05))));
  assert.ok(blueprintShadowCast(size, 1) > blueprintShadowCast(size, 0.2));
  assert.ok(cast > cover.h);

  const open = blueprintShadowPieces(shadow, []);
  assert.equal(open.length, 1);
  assert.equal(open[0]!.keep, 1);
  assert.equal(open[0]!.x, shadow.x);
  assert.equal(open[0]!.y, shadow.y);
  assert.equal(open[0]!.w, shadow.w);
  assert.equal(open[0]!.h, shadow.h);
  const flat = blueprintShadowPieces(shadow, [{ box: cover, extend: 0 }]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0]!.keep, 1);

  const head = blueprintShadowHead(extend);
  assert.ok(Math.abs(blueprintShadowAlpha(extend, 0, cast) - head) < 1e-9);
  assert.equal(blueprintShadowAlpha(extend, cast, cast), 0);
  assert.ok(blueprintShadowAlpha(extend, cast * 0.25, cast) > blueprintShadowAlpha(extend, cast * 0.75, cast));

  const eaten = blueprintShadowPieces(shadow, [{ box: cover, extend: 1 }]);
  const inside = { x: cover.x + cover.w / 2, y: shadow.y + 2 };
  const below = { x: shadow.x + 4, y: cover.y + cover.h + 1 };
  assert.ok(below.y < shadow.y + shadow.h);
  assert.equal(blueprintShadowKeep(1), 0);
  assert.equal(pieceKeepAt(eaten, inside), 0);
  assert.equal(blueprintShadowAlpha(extend, inside.y - shadow.y, cast, 0), 0);
  assert.equal(pieceKeepAt(eaten, below), 1);
  const belowAlong = below.y - shadow.y;
  assert.ok(Math.abs(blueprintShadowAlpha(extend, belowAlong, cast, 1) - head * (1 - belowAlong / cast)) < 1e-9);

  const half = blueprintShadowPieces(shadow, [{ box: cover, extend: 0.5 }]);
  assert.equal(blueprintShadowKeep(0.5), 0.5);
  assert.equal(pieceKeepAt(half, inside), 0.5);
  assert.equal(pieceKeepAt(half, below), 1);
  const along = inside.y - shadow.y;
  assert.ok(Math.abs(blueprintShadowAlpha(extend, along, cast, 0.5) - blueprintShadowAlpha(extend, along, cast) * 0.5) < 1e-9);

  const side = blueprintCellCover({ x: 100 + size * 0.45, y: 200 + size, w: size, h: size });
  const sided = blueprintShadowPieces(shadow, [{ box: side, extend: 1 }]);
  assert.equal(pieceKeepAt(sided, { x: shadow.x + 4, y: shadow.y + 3 }), 1);
  assert.equal(pieceKeepAt(sided, { x: side.x + 4, y: shadow.y + 3 }), 0);

  let area = 0;
  for (const piece of eaten) area += piece.w * piece.h;
  assert.equal(area, shadow.w * shadow.h);
});

test("完全凸出时填色比以前暗，仍比没凸起亮", () => {
  assert.equal(blueprintFillAlpha(1), BLUEPRINT_MAX_LIGHTNESS);
  assert.ok(BLUEPRINT_MAX_LIGHTNESS < 0.27);
  assert.ok(BLUEPRINT_MAX_LIGHTNESS > 0.08);
  assert.ok(blueprintFillAlpha(1) > blueprintFillAlpha(0.3));
});

test("凸出填色贴住网格线", () => {
  const batch = rollBlueprintBatch(world, { seed: 8, serial: 1, goals: 3, ball: null, hoop: null });
  for (const block of blueprintBlocks(world, clock({ cells: batch.cells, goals: 3, cycle: BLUEPRINT_RAISE, duration: BLUEPRINT_RAISE }))) {
    const px = blueprintCellPixels(block.cell);
    assert.equal(px.left, Math.round(block.cell.x));
    assert.equal(px.right, Math.round(block.cell.x + block.cell.w));
    assert.equal(px.top, Math.round(block.cell.y));
    assert.equal(px.bottom, Math.round(block.cell.y + block.cell.h));
    assert.equal(px.fill.x, px.left + 1);
    assert.equal(px.fill.y, px.top + 1);
    assert.equal(px.fill.x + px.fill.w, px.right);
    assert.equal(px.fill.y + px.fill.h, px.bottom);
  }
});

function oldInsetStrokeRect(fill: { x: number; y: number; w: number; h: number }) {
  return { x: fill.x + 1.5, y: fill.y + 1.5, w: fill.w - 3, h: fill.h - 3 };
}

test("凸块白描边落在网格线上，不是旧的填色内缩矩形", () => {
  const batch = rollBlueprintBatch(world, { seed: 8, serial: 1, goals: 3, ball: null, hoop: null });
  for (const block of blueprintBlocks(world, clock({ cells: batch.cells, goals: 3, cycle: BLUEPRINT_RAISE, duration: BLUEPRINT_RAISE }))) {
    const px = blueprintCellPixels(block.cell);
    const stroke = blueprintBlockStrokeRect(block.cell);
    // 与 strokeGrid 相同：线画在 Math.round(p)+0.5，宽高为格子左右/上下边之差。
    assert.equal(stroke.x, px.left + 0.5);
    assert.equal(stroke.y, px.top + 0.5);
    assert.equal(stroke.w, px.right - px.left);
    assert.equal(stroke.h, px.bottom - px.top);
    const inset = oldInsetStrokeRect(px.fill);
    assert.notDeepEqual(stroke, inset);
    assert.notEqual(stroke.x, inset.x);
    assert.notEqual(stroke.y, inset.y);
    assert.notEqual(stroke.w, inset.w);
    assert.notEqual(stroke.h, inset.h);
  }
});

function recordingCtx() {
  const strokes: { style: string; lineWidth: number; x: number; y: number; w: number; h: number }[] = [];
  let strokeStyle = "";
  let lineWidth = 0;
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string) { strokeStyle = String(value); },
    get lineWidth() { return lineWidth; },
    set lineWidth(value: number) { lineWidth = Number(value); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    save() {},
    restore() {},
    clip() {},
    rect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      strokes.push({ style: strokeStyle, lineWidth, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

test("已画出的凸块都在网格线上描不透明白边，含未点亮白块、亮白、绿、红、黑", () => {
  const cells: BlueprintCellRef[] = [
    { col: 4, row: 8, kind: "white" },
    { col: 5, row: 8, kind: "white" },
    { col: 6, row: 8, kind: "green" },
    { col: 7, row: 8, kind: "red" },
    { col: 8, row: 8, kind: "black" },
  ];
  resetBlueprint(1);
  restoreBlueprintClock(clock({
    staticCells: cells,
    staticAge: BLUEPRINT_RAISE,
    duration: BLUEPRINT_RAISE,
    lit: ["5:8"],
  }));
  const { ctx, strokes } = recordingCtx();
  drawBlueprint(ctx, world);
  const blocks = blueprintBlocks(world, getBlueprintClock());
  const tags = new Set(blocks.map((block) => `${block.kind}:${block.lit}`));
  assert.ok(tags.has("white:false"), "unlit white");
  assert.ok(tags.has("white:true"), "lit white");
  assert.ok(tags.has("green:false"), "green");
  assert.ok(tags.has("red:false"), "red");
  assert.ok(tags.has("black:false"), "black");
  assert.equal(blocks.length, 5);
  for (const block of blocks) {
    assert.ok(block.extend >= 0.04);
    const expected = blueprintBlockStrokeRect(block.cell);
    const hit = strokes.find((stroke) => stroke.x === expected.x && stroke.y === expected.y && stroke.w === expected.w && stroke.h === expected.h);
    assert.ok(hit, `missing grid-aligned stroke for ${block.kind} lit=${block.lit}`);
    assert.equal(hit!.style, "#ffffff");
    assert.equal(hit!.lineWidth, 1);
    const inset = oldInsetStrokeRect(blueprintCellPixels(block.cell).fill);
    assert.notDeepEqual({ x: hit!.x, y: hit!.y, w: hit!.w, h: hit!.h }, inset);
  }

  // 尚未凸出到绘制阈值的格子不描边。
  restoreBlueprintClock(clock({
    staticCells: [{ col: 4, row: 9, kind: "white" }],
    staticAge: 0,
    duration: BLUEPRINT_RAISE,
  }));
  const flatBlocks = blueprintBlocks(world, getBlueprintClock());
  const { ctx: flatCtx, strokes: flatStrokes } = recordingCtx();
  drawBlueprint(flatCtx, world);
  assert.ok(flatBlocks.length > 0);
  for (const block of flatBlocks) {
    assert.ok(block.extend < 0.04);
    const expected = blueprintBlockStrokeRect(block.cell);
    assert.equal(
      flatStrokes.filter((stroke) => stroke.x === expected.x && stroke.y === expected.y && stroke.w === expected.w && stroke.h === expected.h).length,
      0,
    );
  }
});

test("同排有未亮格不清排，全亮才缩回，缩回不是瞬间删除", () => {
  const a = { col: 4, row: 8 };
  const b = { col: 5, row: 8 };
  const other = { col: 4, row: 9 };
  const flat = { col: 6, row: 8 };
  const hold = { col: 5, row: 9 };
  const field = [a, b, flat, other];
  assert.deepEqual(blueprintRowClears(8, field, new Set()), []);
  assert.deepEqual(blueprintRowClears(8, field, new Set(["4:8", "5:8"])), []);
  assert.deepEqual(blueprintRowClears(3, field, new Set(["4:8", "5:8", "6:8"])), []);
  assert.deepEqual(blueprintRowClears(8, field, new Set(["4:8", "5:8", "6:8"])), [a, b, flat]);
  assert.deepEqual(blueprintRowClears(9, field, new Set(["4:9"])), []);
  assert.equal(blueprintClearExtend(0, BLUEPRINT_CROSS_RAISE, 1), 1);
  assert.equal(blueprintClearExtend(BLUEPRINT_CROSS_RAISE / 2, BLUEPRINT_CROSS_RAISE, 1), 0.5);
  assert.equal(blueprintClearExtend(BLUEPRINT_CROSS_RAISE, BLUEPRINT_CROSS_RAISE, 1), 0);

  // 动态组缩到撞不到球，格子还在。不能把它剔出这一排，否则剩下的亮格会误清。
  const lowAge = BLUEPRINT_CROSS_RAISE * (1 - 0.05);
  resetBlueprint(3);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [a, b, other, hold],
    staticAge: BLUEPRINT_RAISE,
    dynamic: dyn({
      cells: [flat],
      phase: "cross_out",
      age: lowAge,
      raise: BLUEPRINT_CROSS_RAISE,
    }),
  }));
  const blocks = blueprintBlocks(world);
  const low = blocks.find((block) => block.col === flat.col && block.row === flat.row);
  assert.ok(low && low.extend < BLUEPRINT_HIT_EXTEND && low.extend > 0);
  assert.equal(blueprintProtrudingCells(blocks).some((cell) => cell.col === flat.col), false);
  assert.equal(blueprintFieldCells(getBlueprintClock()).some((cell) => cell.col === flat.col && cell.row === flat.row), true);
  assert.equal(touchBlueprintCell(world, flat.col, flat.row), 0);
  assert.deepEqual(getBlueprintClock().lit, []);
  assert.equal(touchBlueprintCell(world, a.col, a.row), 0);
  assert.equal(touchBlueprintCell(world, a.col, a.row), 0);
  assert.deepEqual(getBlueprintClock().lit, ["4:8"]);
  assert.equal(touchBlueprintCell(world, b.col, b.row), 0);
  const blocked = getBlueprintClock();
  assert.deepEqual(blocked.lit, ["4:8", "5:8"]);
  assert.equal(blocked.pendingBonus, 0);
  assert.equal(blocked.clearing.length, 0);
  assert.equal(blocked.staticCells.length, 4);
  assert.ok(blocked.staticCells.some((cell) => cell.col === b.col && cell.row === b.row));
  assert.deepEqual(blocked.dynamic?.cells, [flat]);
  assert.equal(blueprintBlocks(world).some((block) => block.col === a.col && block.lit), true);
  assert.equal(blueprintBlocks(world).some((block) => block.col === flat.col && !block.lit), true);

  resetBlueprint(3);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [a, b, other],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, a.col, a.row), 0);
  assert.equal(touchBlueprintCell(world, b.col, b.row), 2);
  const started = getBlueprintClock();
  assert.equal(started.pendingBonus, 2);
  assert.equal(started.clearing.length, 2);
  assert.deepEqual(started.staticCells, [other]);
  assert.equal(started.lit.includes("4:8"), false);
  const sinking = blueprintBlocks(world).filter((block) => block.row === 8);
  assert.equal(sinking.length, 2);
  for (const block of sinking) {
    assert.ok(block.extend > 0.9, `清排开始时高度应接近满格，实际 ${block.extend}`);
    assert.equal(block.lit, true);
    assert.ok(block.solid);
  }
  const aim = aimAt(3);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  const halfway = getBlueprintClock();
  assert.equal(halfway.pendingBonus, 2);
  assert.equal(halfway.clearing.length, 2);
  assert.deepEqual(halfway.staticCells, [other]);
  const midBlocks = blueprintBlocks(world).filter((block) => block.row === 8);
  assert.equal(midBlocks.length, 2);
  for (const block of midBlocks) {
    assert.ok(Math.abs(block.extend - 0.5) < 1e-6, `缩到一半应约 0.5，实际 ${block.extend}`);
  }
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  const done = getBlueprintClock();
  assert.equal(done.clearing.length, 0);
  assert.equal(blueprintBlocks(world).some((block) => block.row === 8), false);
  assert.deepEqual(done.staticCells, [other]);
  assert.equal(done.pendingBonus, 2);
  assert.equal(claimBlueprintBonus(), 2);
  assert.equal(claimBlueprintBonus(), 0);

  restoreBlueprintClock(clock({
    goals: 4,
    staticCells: [{ col: 2, row: 5 }],
    staticAge: BLUEPRINT_RAISE,
    lit: ["4:8"],
    pendingBonus: 4,
  }));
  assert.deepEqual(getBlueprintClock().lit, []);
  assert.equal(getBlueprintClock().pendingBonus, 4);
  assert.equal(getBlueprintClock().clearing.length, 0);
  assert.ok(blueprintBlocks(world).every((block) => block.lit === false));
  assert.equal(claimBlueprintBonus(), 4);
});

test("同列有未亮格不清列，全亮才缩回，交叉格只计一次", () => {
  const up = { col: 4, row: 8 };
  const down = { col: 4, row: 9 };
  const side = { col: 5, row: 8 };
  const sideDown = { col: 5, row: 9 };
  const low = { col: 4, row: 10 };
  const lines = [up, down, side, low];
  assert.deepEqual(blueprintColClears(4, lines, new Set()), []);
  assert.deepEqual(blueprintColClears(4, lines, new Set(["4:8", "4:9"])), []);
  assert.deepEqual(blueprintColClears(2, lines, new Set(["4:8", "4:9", "4:10"])), []);
  assert.deepEqual(blueprintColClears(4, lines, new Set(["4:8", "4:9", "4:10"])), [up, down, low]);

  const lowAge = BLUEPRINT_CROSS_RAISE * (1 - 0.05);
  resetBlueprint(5);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [up, side],
    staticAge: BLUEPRINT_RAISE,
    dynamic: dyn({
      cells: [down],
      phase: "cross_out",
      age: lowAge,
      raise: BLUEPRINT_CROSS_RAISE,
    }),
  }));
  assert.equal(touchBlueprintCell(world, up.col, up.row), 0);
  const blocked = getBlueprintClock();
  assert.equal(blocked.pendingBonus, 0);
  assert.equal(blocked.clearing.length, 0);
  assert.equal(blocked.staticCells.length, 2);
  assert.deepEqual(blocked.dynamic?.cells, [down]);
  assert.equal(blocked.lit.includes("4:8"), true);

  resetBlueprint(5);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [up, down, side, sideDown],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, up.col, up.row), 0);
  assert.equal(touchBlueprintCell(world, down.col, down.row), 2);
  const started = getBlueprintClock();
  assert.equal(started.pendingBonus, 2);
  assert.equal(started.clearing.length, 2);
  assert.deepEqual(started.staticCells.map((cell) => `${cell.col}:${cell.row}`).sort(), ["5:8", "5:9"]);
  const sinking = blueprintBlocks(world).filter((block) => block.col === up.col);
  assert.equal(sinking.length, 2);
  for (const block of sinking) {
    assert.ok(block.extend > 0.9, `清列开始时高度应接近满格，实际 ${block.extend}`);
    assert.equal(block.lit, true);
    assert.ok(block.solid);
  }
  const aim = aimAt(3);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  const mid = blueprintBlocks(world).filter((block) => block.col === up.col);
  assert.equal(mid.length, 2);
  for (const block of mid) assert.ok(Math.abs(block.extend - 0.5) < 1e-6, `缩到一半应约 0.5，实际 ${block.extend}`);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(getBlueprintClock().staticCells.length, 2);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  assert.equal(blueprintBlocks(world).some((block) => block.col === up.col), false);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(touchBlueprintCell(world, side.col, side.row), 0);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(getBlueprintClock().staticCells.length, 2);
  assert.equal(touchBlueprintCell(world, sideDown.col, sideDown.row), 2);
  const left = getBlueprintClock();
  assert.equal(left.pendingBonus, 4);
  assert.equal(left.clearing.length, 2);
  assert.deepEqual(left.staticCells, []);
  assert.equal(claimBlueprintBonus(), 4);
  assert.equal(claimBlueprintBonus(), 0);

  const joint = { col: 6, row: 8 };
  const rowMate = { col: 5, row: 8 };
  const colMate = { col: 6, row: 9 };
  const leftover = { col: 7, row: 9 };
  const anchor = { col: 5, row: 9 };
  resetBlueprint(7);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [joint, rowMate, colMate, leftover, anchor],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, rowMate.col, rowMate.row), 0);
  assert.equal(touchBlueprintCell(world, colMate.col, colMate.row), 0);
  assert.equal(touchBlueprintCell(world, joint.col, joint.row), 3);
  const crossed = getBlueprintClock();
  assert.equal(crossed.pendingBonus, 3);
  assert.equal(crossed.clearing.length, 3);
  assert.deepEqual(crossed.clearing.map((cell) => `${cell.col}:${cell.row}`).sort(), ["5:8", "6:8", "6:9"]);
  assert.deepEqual(crossed.staticCells.map((cell) => `${cell.col}:${cell.row}`).sort(), ["5:9", "7:9"]);
  const stillUp = blueprintBlocks(world).filter((block) => block.row === 8 || (block.col === 6 && block.row === 9));
  assert.equal(stillUp.length, 3);
  for (const block of stillUp) assert.ok(block.extend > 0.9);
});

test("单格点亮即清，两格必须全亮，动态亮格落地才凑排", () => {
  const only = { col: 4, row: 8 };
  const mate = { col: 5, row: 8 };
  const apart = { col: 7, row: 8 };
  const gap = [only, mate, apart];
  assert.deepEqual(blueprintRowClears(only.row, [only], new Set(["4:8"])), [only]);
  assert.deepEqual(blueprintColClears(only.col, [only], new Set(["4:8"])), [only]);
  assert.deepEqual(blueprintRowClears(8, [only, mate], new Set(["4:8"])), []);
  assert.deepEqual(blueprintRowClears(8, [only, mate], new Set(["4:8", "5:8"])), [only, mate]);
  const c1 = { col: 1, row: 3 };
  const c2 = { col: 2, row: 3 };
  const c4 = { col: 4, row: 3 };
  assert.deepEqual(blueprintRowClears(3, [c4, c1, c2], new Set(["1:3"])), []);
  assert.deepEqual(blueprintRowClears(3, [c4, c1, c2], new Set(["1:3", "2:3"])), [c1, c2]);
  assert.deepEqual(blueprintRowClears(3, [c4, c1, c2], new Set(["4:3"])), [c4]);
  assert.deepEqual(blueprintRowClears(3, [c4, c1, c2], new Set(["1:3", "2:3", "4:3"])), [c1, c2, c4]);
  const r8 = { col: 4, row: 8 };
  const r9 = { col: 4, row: 9 };
  const r11 = { col: 4, row: 11 };
  assert.deepEqual(blueprintColClears(4, [r11, r8, r9], new Set(["4:8", "4:9"])), [r8, r9]);
  assert.deepEqual(blueprintColClears(4, [r11, r8, r9], new Set(["4:11"])), [r11]);
  assert.deepEqual(blueprintRowClears(8, gap, new Set(["4:8", "5:8"])), [only, mate]);

  resetBlueprint(1);
  restoreBlueprintClock(clock({
    goals: 2,
    staticCells: [only],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, only.col, only.row), 1);
  const started = getBlueprintClock();
  assert.equal(started.pendingBonus, 1);
  assert.equal(started.clearing.length, 1);
  assert.deepEqual(started.staticCells, []);
  const live = blueprintBlocks(world).find((item) => item.col === only.col && item.row === only.row);
  assert.equal(live?.lit, true);
  assert.ok(live && live.extend > 0.9);
  const aim = aimAt(2);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  const mid = blueprintBlocks(world).find((item) => item.col === only.col && item.row === only.row);
  assert.ok(mid && Math.abs(mid.extend - 0.5) < 1e-6);
  assert.equal(getBlueprintClock().pendingBonus, 1);
  stepBlueprint(BLUEPRINT_CROSS_RAISE / 2, true, aim, world);
  assert.equal(blueprintBlocks(world).some((item) => item.col === only.col), false);
  assert.equal(claimBlueprintBonus(), 1);

  const left = { col: 4, row: 8 };
  const beside = { col: 5, row: 8 };
  const lone = { col: 7, row: 8 };
  const diagonal = { col: 8, row: 9 };
  resetBlueprint(9);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [left, beside, lone, diagonal],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, left.col, left.row), 0);
  assert.equal(touchBlueprintCell(world, beside.col, beside.row), 2);
  const paired = getBlueprintClock();
  assert.equal(paired.pendingBonus, 2);
  assert.deepEqual(paired.clearing.map((cell) => `${cell.col}:${cell.row}`).sort(), ["4:8", "5:8"]);
  assert.ok(paired.staticCells.some((cell) => cell.col === lone.col && cell.row === lone.row));
  assert.equal(touchBlueprintCell(world, lone.col, lone.row), 1);
  const separated = getBlueprintClock();
  assert.equal(separated.pendingBonus, 3);
  assert.ok(separated.clearing.some((cell) => cell.col === lone.col && cell.row === lone.row));
  assert.deepEqual(separated.staticCells, [diagonal]);

  const staticA = { col: 4, row: 8 };
  const anchor = { col: 4, row: 9 };
  const far = { col: 7, row: 8 };
  const blocker = { col: 5, row: 8 };
  const mover = { col: 5, row: 7 };
  const landed = { col: 5, row: 8 };
  const blockerNext = { col: 5, row: 9 };
  resetBlueprint(11);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: [staticA, anchor, far],
    staticAge: BLUEPRINT_RAISE,
    lit: ["4:8", "5:7"],
    dynamic: dyn({
      cells: [blocker, mover],
      pending: [blockerNext, landed],
      dir: 1,
      phase: "cross_out",
      age: BLUEPRINT_CROSS_RAISE - 0.01,
      raise: BLUEPRINT_CROSS_RAISE,
      stepSpan: 5,
    }),
  }));
  const before = blueprintFieldCells(getBlueprintClock());
  assert.equal(before.some((cell) => cell.col === blocker.col && cell.row === blocker.row), true);
  assert.deepEqual(blueprintRowClears(8, before, new Set(getBlueprintClock().lit)), []);
  assert.equal(touchBlueprintCell(world, staticA.col, staticA.row), 0);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(getBlueprintClock().dynamic?.cells.length, 2);
  stepBlueprint(0.02, true, aimAt(3), world);
  const after = getBlueprintClock();
  assert.equal(after.pendingBonus, 2);
  assert.deepEqual(after.clearing.map((cell) => `${cell.col}:${cell.row}`).sort(), ["4:8", "5:8"]);
  assert.deepEqual(after.dynamic?.cells, [blockerNext]);
  assert.equal(after.dynamic?.phase, "cross_in");
  assert.deepEqual(after.staticCells.map((cell) => `${cell.col}:${cell.row}`).sort(), ["4:9", "7:8"]);
  const sinking = blueprintBlocks(world).find((item) => item.col === staticA.col && item.row === staticA.row);
  assert.ok(sinking && sinking.extend > 0.8);
});

test("相邻两格只踩一格不会把邻格点亮", () => {
  const a = { col: 4, row: 8 };
  const b = { col: 5, row: 8 };
  resetBlueprint(2);
  restoreBlueprintClock(clock({
    goals: 2,
    staticCells: [a, b],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, a.col, a.row), 0);
  assert.deepEqual(getBlueprintClock().lit, ["4:8"]);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(getBlueprintClock().clearing.length, 0);
  assert.equal(getBlueprintClock().staticCells.length, 2);
  assert.equal(blueprintBlocks(world).find((block) => block.col === b.col)?.lit, false);
  assert.equal(touchBlueprintCell(world, b.col, b.row), 2);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(getBlueprintClock().clearing.length, 2);

  resetBlueprint(2);
  restoreBlueprintClock(clock({
    goals: 2,
    staticCells: [a, b],
    staticAge: BLUEPRINT_RAISE,
  }));
  const blockA = blueprintBlocks(world).find((block) => block.col === a.col)!;
  const blockB = blueprintBlocks(world).find((block) => block.col === b.col)!;
  const onA = {
    x: blockA.cell.x + blockA.cell.w / 2,
    y: blockA.cell.y + blockA.cell.h / 2,
    vx: 0,
    vy: 40,
    r: world.ballR,
  };
  assert.ok(onA.r > blockA.cell.w / 2);
  assert.equal(collideBlueprint(world, onA, onA.x, onA.y - 24), true);
  assert.deepEqual(getBlueprintClock().lit, ["4:8"]);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(getBlueprintClock().staticCells.length, 2);
  assert.equal(blueprintBlocks(world).find((block) => block.col === b.col)?.lit, false);
  const onB = {
    x: blockB.cell.x + blockB.cell.w / 2,
    y: blockB.cell.y + blockB.cell.h / 2,
    vx: 0,
    vy: 40,
    r: world.ballR,
  };
  assert.equal(collideBlueprint(world, onB, onB.x, onB.y - 24), true);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(getBlueprintClock().clearing.length, 2);
  assert.deepEqual(getBlueprintClock().staticCells, []);
});

test("十字中心有邻块不清，横段或竖段亮齐才消", () => {
  const crossA = { col: 5, row: 8 };
  const crossB = { col: 4, row: 9 };
  const crossC = { col: 5, row: 9 };
  const crossD = { col: 6, row: 9 };
  const crossE = { col: 5, row: 10 };
  const cross = [crossA, crossB, crossC, crossD, crossE];
  assert.deepEqual(blueprintRowClears(9, cross, new Set(["5:9"])), []);
  assert.deepEqual(blueprintColClears(5, cross, new Set(["5:9"])), []);
  assert.deepEqual(blueprintRowClears(9, cross, new Set(["4:9", "5:9", "6:9"])), [crossB, crossC, crossD]);
  assert.deepEqual(blueprintColClears(5, cross, new Set(["4:9", "5:9", "6:9"])), []);
  assert.deepEqual(blueprintColClears(5, cross, new Set(["5:8", "5:9", "5:10"])), [crossA, crossC, crossE]);
  assert.deepEqual(blueprintRowClears(9, cross, new Set(["5:8", "5:9", "5:10"])), []);

  resetBlueprint(13);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: cross,
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, crossC.col, crossC.row), 0);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(getBlueprintClock().staticCells.length, 5);
  assert.equal(touchBlueprintCell(world, crossB.col, crossB.row), 0);
  assert.equal(touchBlueprintCell(world, crossD.col, crossD.row), 3);
  const horizontal = getBlueprintClock();
  assert.equal(horizontal.pendingBonus, 3);
  assert.deepEqual(horizontal.clearing.map((cell) => `${cell.col}:${cell.row}`).sort(), ["4:9", "5:9", "6:9"]);
  assert.deepEqual(horizontal.staticCells.map((cell) => `${cell.col}:${cell.row}`).sort(), ["5:10", "5:8"]);

  resetBlueprint(13);
  restoreBlueprintClock(clock({
    goals: 3,
    staticCells: cross,
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, crossA.col, crossA.row), 0);
  assert.equal(touchBlueprintCell(world, crossE.col, crossE.row), 0);
  assert.equal(touchBlueprintCell(world, crossC.col, crossC.row), 3);
  const vertical = getBlueprintClock();
  assert.equal(vertical.pendingBonus, 3);
  assert.deepEqual(vertical.clearing.map((cell) => `${cell.col}:${cell.row}`).sort(), ["5:10", "5:8", "5:9"]);
  assert.deepEqual(vertical.staticCells.map((cell) => `${cell.col}:${cell.row}`).sort(), ["4:9", "6:9"]);
  const still = blueprintBlocks(world).filter((block) => block.row === 9 && block.col !== 5);
  assert.equal(still.length, 2);
  for (const block of still) assert.equal(block.lit, false);
});

test("待领在缩回开始就挂上，分身不领走，换批不清掉，实体进球才结算", () => {
  const only = { col: 4, row: 8 };
  resetBlueprint(21);
  restoreBlueprintClock(clock({
    goals: 1,
    staticCells: [only],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, only.col, only.row), 1);
  assert.equal(getBlueprintClock().pendingBonus, 1);
  assert.equal(getBlueprintClock().clearing.length, 1);

  assert.equal(claimBlueprintBonusForBasket(false), 0);
  assert.equal(getBlueprintClock().pendingBonus, 1);

  stepBlueprint(0.016, true, aimAt(2), world);
  const swapped = getBlueprintClock();
  assert.equal(swapped.goals, 2);
  assert.equal(swapped.pendingBonus, 1);

  assert.equal(claimBlueprintBonusForBasket(true), 1);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(claimBlueprintBonusForBasket(false), 0);
  assert.equal(claimBlueprintBonusForBasket(true), 0);
});

test("pending=N 时实体结算返回 N 并归零，分身结算不改待领", () => {
  const only = { col: 4, row: 8 };
  resetBlueprint(31);
  restoreBlueprintClock(clock({
    goals: 2,
    staticCells: [only],
    staticAge: BLUEPRINT_RAISE,
  }));
  assert.equal(touchBlueprintCell(world, only.col, only.row), 1);
  const pending = getBlueprintClock().pendingBonus;
  assert.equal(pending, 1);

  const gain = 4;
  let score = 10;
  const ghost = settleBlueprintBasket(gain, false);
  assert.equal(ghost.bonus, 0);
  assert.equal(ghost.shown, gain);
  assert.equal(getBlueprintClock().pendingBonus, pending);
  score += ghost.bonus;
  assert.equal(score, 10);

  const real = settleBlueprintBasket(gain, true);
  assert.equal(real.bonus, pending);
  assert.equal(real.shown, gain + pending);
  score += gain + real.bonus;
  assert.equal(score, 10 + gain + pending);
  assert.equal(getBlueprintClock().pendingBonus, 0);

  const again = settleBlueprintBasket(gain, true);
  assert.equal(again.bonus, 0);
  assert.equal(again.shown, gain);
  assert.equal(getBlueprintClock().pendingBonus, 0);
});

test("进球换静态后新静态全暗，留下的动态保持点亮", () => {
  const aim = aimAt(10);
  const ball = { x: aim.ballX, y: aim.ballY };
  const hoop = { x: aim.hoopX, y: aim.hoopY };
  let sawReuse = false;
  let sawKeptDynamic = false;
  for (let seed = 1; seed < 240; seed++) {
    const batch = rollBlueprintBatch(world, { seed, serial: 2, goals: 10, ball, hoop });
    const next = batch.cells[0];
    if (!next) continue;
    const legal = blueprintLegalCells(world, ball);
    const mover = legal.find((cell) => cell.col !== next.col || cell.row !== next.row);
    if (!mover) continue;
    resetBlueprint(seed);
    restoreBlueprintClock(clock({
      seed,
      goals: 9,
      serial: 1,
      staticCells: [{ col: next.col, row: next.row }],
      staticAge: BLUEPRINT_RAISE,
      lit: [`${next.col}:${next.row}`, `${mover.col}:${mover.row}`],
      dynamic: dyn({
        cells: [{ col: mover.col, row: mover.row }],
        phase: "hold",
        age: 0.1,
        stepSpan: 10,
      }),
    }));
    stepBlueprint(0.02, true, aim, world);
    const after = getBlueprintClock();
    const dynKeys = new Set((after.dynamic?.cells ?? []).map((cell) => `${cell.col}:${cell.row}`));
    for (const cell of after.staticCells) {
      const key = `${cell.col}:${cell.row}`;
      if (dynKeys.has(key)) continue;
      assert.equal(after.lit.includes(key), false);
    }
    if (after.staticCells.some((cell) => cell.col === next.col && cell.row === next.row) && !dynKeys.has(`${next.col}:${next.row}`)) {
      sawReuse = true;
    }
    if (after.dynamic?.cells.some((cell) => cell.col === mover.col && cell.row === mover.row)) {
      assert.equal(after.lit.includes(`${mover.col}:${mover.row}`), true);
      sawKeptDynamic = true;
    } else {
      assert.equal(after.lit.includes(`${mover.col}:${mover.row}`), false);
    }
    if (sawReuse && sawKeptDynamic) break;
  }
  assert.equal(sawReuse, true);
  assert.equal(sawKeptDynamic, true);
});

test("凸块投影不进入倒计时条", () => {
  const hudBottom = 159;
  const through = clipBlueprintPaintBox({ x: 40, y: 140, w: 28, h: 80, keep: 1 }, hudBottom);
  if (!through) throw new Error("穿过倒计时条的投影应留下条下的一段");
  assert.equal(through.y, hudBottom);
  assert.equal(through.h, 140 + 80 - hudBottom);
  assert.equal(through.keep, 1);
  assert.equal(clipBlueprintPaintBox({ x: 40, y: 100, w: 28, h: 40 }, hudBottom), null);
  const court = blueprintShadowBox({ x: 100, y: 200, w: 28, h: 28 }, 1);
  assert.deepEqual(clipBlueprintPaintBox(court, hudBottom), court);
});

test("开黑洞清掉全部凸块，基础分只按已亮格数加一次", () => {
  const litStatic = { col: 4, row: 8 };
  const darkStatic = { col: 5, row: 8 };
  const litMover = { col: 6, row: 8 };
  const darkMover = { col: 6, row: 9 };
  const overlap = { col: 7, row: 9 };
  resetBlueprint(4);
  restoreBlueprintClock(clock({
    goals: 2,
    staticCells: [litStatic, darkStatic, overlap],
    staticAge: BLUEPRINT_RAISE,
    lit: ["4:8", "6:8", "7:9"],
    pendingBonus: 3,
    clearing: [{ col: 8, row: 9, age: 0.05, span: BLUEPRINT_CROSS_RAISE, from: 1 }],
    dynamic: dyn({ cells: [litMover, darkMover, overlap], phase: "hold", stepSpan: 10 }),
  }));
  assert.equal(consumeBlueprintLitForHole(), 3);
  const after = getBlueprintClock();
  assert.equal(after.pendingBonus, 3);
  assert.deepEqual(after.lit, []);
  assert.deepEqual(after.staticCells, []);
  assert.equal(after.dynamic, null);
  assert.deepEqual(after.clearing, []);
  assert.equal(blueprintBlocks(world, after).length, 0);
  assert.equal(consumeBlueprintLitForHole(), 0);
  assert.equal(getBlueprintClock().pendingBonus, 3);
});

test("时间球快退把凸块、点亮、伸缩和待领退回取样", () => {
  resetBlueprint(3);
  restoreBlueprintClock(clock({
    goals: 2,
    seed: 3,
    serial: 4,
    elapsed: 1.5,
    staticCells: [{ col: 4, row: 8 }, { col: 5, row: 8 }],
    staticAge: 0.2,
    staticRaise: BLUEPRINT_RAISE,
    lit: ["4:8"],
    pendingBonus: 2,
    clearing: [{ col: 6, row: 8, age: 0.05, span: BLUEPRINT_CROSS_RAISE, from: 0.8 }],
    dynamic: dyn({ cells: [{ col: 7, row: 9 }, { col: 7, row: 10 }], phase: "cross_out", age: 0.04, stepSpan: 0.6, pending: [{ col: 8, row: 9 }, { col: 8, row: 10 }], dir: 0 }),
  }));
  const shot = getBlueprintClock();
  shot.staticCells.push({ col: 1, row: 1 });
  shot.lit.push("9:9");
  if (shot.dynamic) shot.dynamic.age = 999;
  const live = getBlueprintClock();
  assert.deepEqual(live.staticCells.map((cell) => `${cell.col}:${cell.row}`), ["4:8", "5:8"]);
  assert.deepEqual(live.lit, ["4:8"]);
  assert.equal(live.dynamic?.age, 0.04);
  stepBlueprint(0.16, true, aimAt(4), world);
  consumeBlueprintLitForHole();
  const ahead = getBlueprintClock();
  assert.equal(ahead.goals, 4);
  assert.notDeepEqual(ahead.staticCells, live.staticCells);
  restoreBlueprintClock(live);
  const back = getBlueprintClock();
  assert.equal(back.goals, live.goals);
  assert.equal(back.serial, live.serial);
  assert.equal(back.elapsed, live.elapsed);
  assert.equal(back.staticAge, live.staticAge);
  assert.deepEqual(back.staticCells, live.staticCells);
  assert.deepEqual(back.lit, live.lit);
  assert.equal(back.pendingBonus, live.pendingBonus);
  assert.deepEqual(back.clearing, live.clearing);
  assert.equal(back.dynamic?.phase, "cross_out");
  assert.equal(back.dynamic?.age, live.dynamic?.age);
  assert.deepEqual(back.dynamic?.cells, live.dynamic?.cells);
  assert.deepEqual(back.dynamic?.pending, live.dynamic?.pending);
  stepBlueprint(0.02, true, aimAt(live.goals), world);
  const stayed = getBlueprintClock();
  assert.deepEqual(stayed.staticCells, live.staticCells);
  assert.deepEqual(stayed.lit, live.lit);
  assert.equal(stayed.pendingBonus, live.pendingBonus);
  assert.equal(stayed.dynamic?.phase, "cross_out");
  assert.ok(Math.abs((stayed.staticAge ?? 0) - (live.staticAge + 0.02)) < 1e-9);
});

test("黑洞期间不换批不生成动态，结束后按当前进球数恢复", () => {
  resetBlueprint(8);
  stepBlueprint(0.02, true, aimAt(3), world);
  const before = getBlueprintClock();
  assert.equal(before.goals, 3);
  assert.equal(before.staticCells.length, 1);
  const kept = before.staticCells.map((cell) => `${cell.col}:${cell.row}`);
  const keptDynamic = (before.dynamic?.cells ?? []).map((cell) => `${cell.col}:${cell.row}`);
  stepBlueprint(0.4, true, aimAt(6), world, { generationHold: true });
  const held = getBlueprintClock();
  assert.equal(held.goals, 3);
  assert.deepEqual(held.staticCells.map((cell) => `${cell.col}:${cell.row}`), kept);
  assert.deepEqual((held.dynamic?.cells ?? []).map((cell) => `${cell.col}:${cell.row}`), keptDynamic);
  assert.ok(held.staticAge > before.staticAge);
  stepBlueprint(0.02, true, aimAt(6), world);
  const resumed = getBlueprintClock();
  assert.equal(resumed.goals, 6);
  assert.ok(resumed.staticCells.length >= 1);
  assert.ok(resumed.staticAge < 0.05);
});

test("靠近倒计时条的格子整格在条下，不会被切成半截", () => {
  const wide = makeWorld(450, 800);
  const bar = blueprintHudBar(wide);
  const top = blueprintPlayfieldTop(wide);
  assert.ok(bar.bottom > wide.h * 0.2, "宽画面上计时条底边低于上方两成");
  assert.equal(top, bar.bottom);
  const grid = blueprintGrid(wide);
  let straddling = 0;
  for (let row = 0; row < grid.rows; row++) {
    const y = grid.oy + row * grid.size;
    if (y < bar.bottom && y + grid.size > bar.bottom) {
      straddling += 1;
      assert.equal(blueprintLegalCells(wide, null).some((cell) => cell.row === row), false);
    }
  }
  assert.ok(straddling > 0, "应存在横跨计时条底边的网格行");
  const legal = blueprintLegalCells(wide, null);
  assert.ok(legal.length > 0);
  for (const cell of legal) {
    assert.ok(cell.y >= bar.bottom);
    assert.equal(cell.h, grid.size);
    assert.ok(cell.y + cell.h > bar.bottom);
  }
  const phone = makeWorld();
  const phoneBar = blueprintHudBar(phone);
  assert.ok(phoneBar.bottom <= phone.h * 0.2);
  assert.equal(blueprintPlayfieldTop(phone), phone.h * 0.2);
  for (const cell of blueprintLegalCells(phone, null)) {
    assert.ok(cell.y >= phone.h * 0.2);
    assert.ok(cell.y >= phoneBar.bottom);
  }
});

test("PR31 普通点亮白色；彩块权重与生成确定且三色均可生成", () => {
  assert.equal(BLUEPRINT_LIT_RGB, "255, 255, 255");
  assert.equal(BLUEPRINT_RED_RGB, "217, 0, 27");
  assert.equal(BLUEPRINT_CLOCK_SECONDS, 1);
  assert.deepEqual(BLUEPRINT_KIND_WEIGHTS, { white: 0.74, green: 0.12, red: 0.08, black: 0.06 });
  assert.equal(BLUEPRINT_BLACK, "#1A1A1A");
  const seen = new Set();
  for (let serial = 0; serial < 160; serial++) {
    const opts = { seed: 52, serial, goals: 21 };
    const batch = rollBlueprintBatch(world, opts);
    assert.deepEqual(batch, rollBlueprintBatch(world, opts));
    for (const cell of batch.cells) seen.add(cell.kind);
  }
  assert.deepEqual([...seen].sort(), ["black", "green", "red", "white"]);
  assert.equal(blueprintBlocks(world, clock({ staticCells: [{ col: 4, row: 8 }], staticAge: 1 }))[0]?.kind, "white");
});

test("PR31 green 真正消除才按已解锁奖池抽一项，叠层/重触/清动画仅领一次", () => {
  const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  const mate = { col: 5, row: 8 };
  const seen = new Set();
  for (let seed = 1; seed <= 160; seed++) {
    restoreBlueprintClock(clock({ seed, goals: 12, staticCells: [green, mate], staticAge: 1, dynamic: dyn({ cells: [green], stepSpan: 10 }) }));
    const first = touchBlueprintCell(world, 4, 8);
    assert.equal(first, 0);
    assert.deepEqual(getBlueprintRewards(), { base: 0, combo: 0, seconds: 0 });
    assert.equal(getBlueprintScoreDoubleCharges(), 0);
    const cleared = touchBlueprintCell(world, 5, 8);
    assert.ok(cleared >= 2);
    const events = drainBlueprintRewardEvents();
    assert.equal(events.length, 1);
    const event = events[0]!;
    seen.add(event);
    assert.deepEqual(getBlueprintRewards(), { base: event === "base" ? 2 : 0, combo: event === "combo" ? 1 : 0, seconds: event === "seconds" ? BLUEPRINT_CLOCK_SECONDS : 0 });
    if (event === "scoreDouble") assert.equal(getBlueprintScoreDoubleCharges(), 1);
    else assert.equal(getBlueprintScoreDoubleCharges(), 0);
    assert.equal(touchBlueprintCell(world, 4, 8), 0);
    consumeBlueprintLitForHole();
    assert.deepEqual(drainBlueprintRewardEvents(), []);
  }
  assert.deepEqual([...seen].sort(), ["areaClear", "base", "combo", "scoreDouble", "seconds"]);
});

test("PR31 红碰撞清横竖连续十字，不越空格、不要求lit，连带green领奖", () => {
  const red: BlueprintCellRef = { col: 5, row: 9, kind: "red" };
  const cross: BlueprintCellRef[] = [red, { col: 4, row: 9 }, { col: 6, row: 9, kind: "green" }, { col: 5, row: 8 }, { col: 5, row: 10 }];
  const beyond = [{ col: 8, row: 9 }, { col: 5, row: 12 }];
  restoreBlueprintClock(clock({ goals: 12, staticCells: [...cross, ...beyond], staticAge: 1 }));
  const block = blueprintBlocks(world).find((item) => item.kind === "red")!;
  const ball = { x: block.cell.x + 6, y: block.cell.y + 14, vx: 500, vy: 0, r: 5 };
  assert.equal(collideBlueprint(world, ball, block.cell.x - 7, ball.y), true);
  assert.deepEqual(getBlueprintClock().staticCells, beyond);
  assert.equal(getBlueprintClock().clearing.length, 5);
  assert.equal(getBlueprintClock().pendingBonus, 5);
  assert.equal(drainBlueprintRewardEvents().length, 1);
  assert.equal(blueprintBlocks(world).find((item) => item.col === 6 && item.row === 9)?.kind, "green");
  restoreBlueprintClock(clock({ staticCells: [red], staticAge: 1 }));
  assert.equal(touchBlueprintCell(world, red.col, red.row), 1);
});

test("PR31 快照含类型奖励抽签，新局清零，换批/跨关保留，restore不重放toast", () => {
  const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  restoreBlueprintClock(clock({ seed: 71, goals: 12, staticCells: [green], staticAge: 1 }));
  const before = getBlueprintClock();
  touchBlueprintCell(world, 4, 8);
  const event = drainBlueprintRewardEvents();
  const rewarded = getBlueprintClock();
  rewarded.rewards!.base += 100;
  assert.notDeepEqual(getBlueprintRewards(), rewarded.rewards);
  const saved = getBlueprintClock();
  restoreBlueprintClock(before);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  touchBlueprintCell(world, 4, 8);
  assert.deepEqual(drainBlueprintRewardEvents(), event);
  assert.deepEqual(getBlueprintRewards(), saved.rewards);
  restoreBlueprintClock(saved);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.deepEqual(getBlueprintClock().clearing, saved.clearing);
  stepBlueprint(0, true, aimAt(2), world);
  assert.deepEqual(getBlueprintRewards(), saved.rewards);
  resetBlueprintProgress(true);
  assert.deepEqual(getBlueprintRewards(), saved.rewards);
  assert.equal(getBlueprintClock().rewardSerial, saved.rewardSerial);
  resetBlueprintProgress();
  assert.deepEqual(getBlueprintRewards(), { base: 0, combo: 0, seconds: 0 });
  assert.equal(getBlueprintClock().rewardSerial, 0);
});

test("PR31 动态颜色跟块移动；黑洞未亮green与叠层一次领奖", () => {
  const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  const red: BlueprintCellRef = { col: 5, row: 8, kind: "red" };
  restoreBlueprintClock(clock({ staticCells: [], dynamic: dyn({ cells: [green, red], pending: blueprintTranslateCells([green, red], 1), dir: 1, phase: "cross_out", age: 0.19, raise: 0.2 }) }));
  stepBlueprint(0.02, true, { ...aimAt(1), ballX: -400, ballY: -400 }, world);
  stepBlueprint(0.1, true, undefined, world);
  const moved = blueprintBlocks(world).filter((item) => item.dynamic);
  assert.deepEqual(moved.map((item) => [item.col, item.row, item.kind]), [[4, 9, "green"], [5, 9, "red"]]);
  assert.deepEqual(getBlueprintClock().dynamic?.cells.map((cell) => cell.kind), ["green", "red"]);
  restoreBlueprintClock(clock({ goals: 12, staticCells: [green], dynamic: dyn({ cells: [green] }), staticAge: 1 }));
  assert.equal(consumeBlueprintLitForHole(), 0);
  assert.equal(drainBlueprintRewardEvents().length, 1);
  assert.equal(consumeBlueprintLitForHole(), 0);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
});

test("标题和开发者场景条都有蓝图，其它场景配色不动", () => {
  assert.deepEqual(SCENE_LABELS.map((item) => item.name), ["街头", "监狱", "都市", "列车", "蓝图"]);
  setScene("blueprint");
  assert.equal(getScene().id, "blueprint");
  assert.equal(getScene().name, "蓝图");
  assert.equal(getScene().hoop.rim, "#ffffff");
  assert.equal(getScene().hoop.pad, "#ffffff");
  setScene("street");
  assert.equal(getScene().name, "街头");
  assert.equal(getScene().hoop.rim, "#e24a28");
  setScene("prison");
  assert.equal(getScene().hoop.rim, "#1a1a1a");
  setScene("street");
});


test("前 3 球没有方块，种类按进球数解锁并归一化", () => {
  for (let goals = 0; goals <= 2; goals++) {
    assert.equal(blueprintSampleCount(goals, 0), 0);
    assert.equal(rollBlueprintBatch(world, { seed: 52, serial: 0, goals }).cells.length, 0);
  }
  for (let goals = 3; goals <= 5; goals++) {
    for (let serial = 0; serial < 80; serial++) {
      assert.equal(blueprintSampleCount(goals, serial / 79), 1);
      const batch = rollBlueprintBatch(world, { seed: 52, serial, goals });
      assert.ok(batch.cells.length <= 1);
      assert.ok(batch.cells.every((cell) => (cell.kind ?? "white") === "white"));
    }
  }
  const whiteOnly = blueprintKindWeights(8);
  assert.equal(whiteOnly.white, 1);
  assert.equal(whiteOnly.green, 0);
  assert.equal(whiteOnly.red, 0);
  assert.equal(whiteOnly.black, 0);
  const wg = blueprintKindWeights(9);
  assert.ok(Math.abs(wg.white - 0.74 / 0.86) < 1e-12);
  assert.ok(Math.abs(wg.green - 0.12 / 0.86) < 1e-12);
  assert.equal(wg.red, 0);
  assert.equal(wg.black, 0);
  const wgr = blueprintKindWeights(15);
  assert.ok(Math.abs(wgr.white - 0.74 / 0.94) < 1e-12);
  assert.ok(Math.abs(wgr.green - 0.12 / 0.94) < 1e-12);
  assert.ok(Math.abs(wgr.red - 0.08 / 0.94) < 1e-12);
  assert.equal(wgr.black, 0);
  assert.deepEqual(blueprintKindWeights(21), { ...BLUEPRINT_KIND_WEIGHTS });
  for (let serial = 0; serial < 80; serial++) {
    const mid = rollBlueprintBatch(world, { seed: 53, serial, goals: 14 });
    assert.ok(mid.cells.every((cell) => cell.kind !== "red" && cell.kind !== "black"));
    const preBlack = rollBlueprintBatch(world, { seed: 54, serial, goals: 20 });
    assert.ok(preBlack.cells.every((cell) => cell.kind !== "black"));
  }
});

test("粗竖线右移一格，地面横线密度可调且默认可还原", () => {
  assert.equal(blueprintMajorColumn(0),false);assert.equal(blueprintMajorColumn(1),true);assert.equal(blueprintMajorColumn(5),true);
  setBlueprintFloorDensity(1);const normal=blueprintFloorRowY(world,1);
  setBlueprintFloorDensity(2);assert.ok(blueprintFloorRowY(world,1)<normal);
  setBlueprintFloorDensity(.5);assert.ok(blueprintFloorRowY(world,1)>normal);
  assert.equal(setBlueprintFloorDensity(99),2.5);assert.equal(setBlueprintFloorDensity(-1),.4);
  setBlueprintFloorDensity(1);assert.equal(getBlueprintFloorDensity(),1);assert.equal(blueprintFloorRowY(world,1),normal);
});

test("地面纵线开合只旋转方向，墙地起点不动且不影响横线", () => {
  const x=world.w*.25, y=world.h;
  setBlueprintFloorSpread(1);const normal=blueprintFloorDepthX(world,x,y),row=blueprintFloorRowY(world,2);
  for(const n of [0,.5,1,2,3]) {setBlueprintFloorSpread(n);assert.equal(blueprintFloorDepthX(world,x,world.floorY),x);assert.equal(blueprintFloorRowY(world,2),row);}
  setBlueprintFloorSpread(0);assert.equal(blueprintFloorDepthX(world,x,y),x);
  setBlueprintFloorSpread(2);assert.ok(Math.abs(blueprintFloorDepthX(world,x,y)-(x+2*(normal-x)))<1e-9);
  setBlueprintFloorSpread(1);assert.equal(getBlueprintFloorSpread(),1);
});

test("正式默认固定横线140%纵线180%，无效输入恢复所选默认", () => {
  assert.equal(BLUEPRINT_DEFAULT_FLOOR_DENSITY,1.4);
  assert.equal(BLUEPRINT_DEFAULT_FLOOR_SPREAD,1.8);
  assert.equal(setBlueprintFloorDensity(NaN),1.4);
  assert.equal(setBlueprintFloorSpread(NaN),1.8);
  setBlueprintFloorDensity(1);setBlueprintFloorSpread(1);
});


function clearIsolatedGreen(seed: number, goals = 12) {
  const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  restoreBlueprintClock(clock({ seed, goals, staticCells: [green], staticAge: 1 }));
  assert.equal(touchBlueprintCell(world, 4, 8), 1);
  return drainBlueprintRewardEvents();
}

test("一分钟 + 蓝图：多次绿消除只有 base/combo，seconds 为 0，timer 与 HUD 分母保持 60", () => {
  const previous = getBlueprintAllowSeconds();
  setBlueprintAllowSeconds(false);
  try {
    const seen = new Set<string>();
    let eventCount = 0;
    let grantedSeconds = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const events = clearIsolatedGreen(seed);
      assert.equal(events.length, 1, "每个绿块都要发出一项奖励，不能先抽秒再丢掉");
      assert.ok(events[0] === "base" || events[0] === "combo" || events[0] === "scoreDouble" || events[0] === "areaClear");
      assert.notEqual(events[0], "seconds");
      seen.add(events[0]!);
      eventCount += events.length;
      grantedSeconds += getBlueprintRewards().seconds;
    }
    assert.deepEqual([...seen].sort(), ["areaClear", "base", "combo", "scoreDouble"]);
    assert.equal(eventCount, 160);
    assert.equal(grantedSeconds, 0);
    assert.equal(getBlueprintRewards().seconds, 0);

    let timer = 60;
    const timerMax = 60;
    // 模拟 showBlueprintRewards：一分钟即使误收到 seconds 也不加时、不弹时钟文案。
    for (const reward of ["base", "combo", "seconds"] as const) {
      if (reward === "seconds" && !blueprintAppliesClockReward(true)) continue;
      if (reward === "seconds") timer += BLUEPRINT_CLOCK_SECONDS;
    }
    assert.equal(timer, 60);
    assert.equal(timerMax, 60);
    assert.equal(blueprintHudClockBudget(timerMax, getBlueprintRewards().seconds, true), 60);
    assert.equal(blueprintHudClockBudget(timerMax, 9, true), 60, "兜底：分母不被 rewards.seconds 撑大");
    assert.equal(blueprintAppliesClockReward(true), false);
  } finally {
    setBlueprintAllowSeconds(previous);
  }
});

test("一分钟模式红叉连带与黑洞清绿块同样不加时", () => {
  const previous = getBlueprintAllowSeconds();
  setBlueprintAllowSeconds(false);
  try {
    const red: BlueprintCellRef = { col: 5, row: 9, kind: "red" };
    const cross: BlueprintCellRef[] = [red, { col: 4, row: 9 }, { col: 6, row: 9, kind: "green" }, { col: 5, row: 8 }, { col: 5, row: 10 }];
    restoreBlueprintClock(clock({ seed: 11, goals: 12, staticCells: cross, staticAge: 1 }));
    assert.equal(touchBlueprintCell(world, red.col, red.row), 5);
    const fromRed = drainBlueprintRewardEvents();
    assert.equal(fromRed.length, 1);
    assert.ok(fromRed[0] === "base" || fromRed[0] === "combo" || fromRed[0] === "scoreDouble" || fromRed[0] === "areaClear");
    assert.notEqual(fromRed[0], "seconds");
    assert.equal(getBlueprintRewards().seconds, 0);

    const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
    restoreBlueprintClock(clock({ seed: 21, goals: 12, staticCells: [green], staticAge: 1 }));
    assert.equal(consumeBlueprintLitForHole(), 0);
    const fromHole = drainBlueprintRewardEvents();
    assert.equal(fromHole.length, 1);
    assert.ok(fromHole[0] === "base" || fromHole[0] === "combo" || fromHole[0] === "scoreDouble" || fromHole[0] === "areaClear");
    assert.notEqual(fromHole[0], "seconds");
    assert.equal(getBlueprintRewards().seconds, 0);
  } finally {
    setBlueprintAllowSeconds(previous);
  }
});

test("经典 + 蓝图：seconds 仍可发出，timer 加 1，累计进入后续续钟预算", () => {
  const previous = getBlueprintAllowSeconds();
  setBlueprintAllowSeconds(true);
  try {
    assert.equal(blueprintAppliesClockReward(false), true);
    let secondsEvent: string | undefined;
    let timer = 15;
    const timerMax = 15;
    for (let seed = 1; seed <= 40; seed++) {
      const events = clearIsolatedGreen(seed);
      assert.equal(events.length, 1);
      if (events[0] === "seconds") {
        secondsEvent = events[0];
        if (blueprintAppliesClockReward(false)) timer += BLUEPRINT_CLOCK_SECONDS;
        break;
      }
    }
    assert.equal(secondsEvent, "seconds");
    assert.equal(getBlueprintRewards().seconds, BLUEPRINT_CLOCK_SECONDS);
    assert.equal(getBlueprintRewards().seconds, 1);
    assert.equal(timer, 16);
    assert.equal(blueprintHudClockBudget(15, 1, false), 16);
    assert.equal(blueprintHudClockBudget(timerMax, getBlueprintRewards().seconds, false), 16, "续钟预算含累计 +1");
    assert.equal(blueprintHudClockBudget(timerMax, 6, false), 21);
  } finally {
    setBlueprintAllowSeconds(previous);
  }
});

test("一分钟兜底：即使收到 seconds 也不加时、不弹时钟文案", () => {
  assert.equal(blueprintAppliesClockReward(true), false);
  assert.equal(blueprintAppliesClockReward(false), true);
  assert.equal(blueprintHudClockBudget(60, 3, true), 60);
  assert.equal(blueprintHudClockBudget(15, BLUEPRINT_CLOCK_SECONDS, false), 16);

  let toast: string | null = null;
  let timer = 60;
  if (blueprintAppliesClockReward(true)) {
    timer += BLUEPRINT_CLOCK_SECONDS;
    toast = `永久时钟 +${BLUEPRINT_CLOCK_SECONDS}秒`;
  }
  assert.equal(timer, 60);
  assert.equal(toast, null);

  setBlueprintAllowSeconds(true);
  assert.equal(getBlueprintAllowSeconds(), true);
  resetBlueprint(1);
  assert.equal(getBlueprintAllowSeconds(), true, "resetBlueprint 不改模式标志");
});

test("奖励池按进球数解锁；一分钟永不写 seconds", () => {
  assert.deepEqual(blueprintRewardPool(true, 8), []);
  assert.deepEqual(blueprintRewardPool(true, 9), ["base", "combo", "seconds", "scoreDouble"]);
  assert.deepEqual(blueprintRewardPool(false, 9), ["base", "combo", "scoreDouble"]);
  assert.deepEqual(blueprintRewardPool(true, 12), ["base", "combo", "seconds", "scoreDouble", "areaClear"]);
  assert.deepEqual(blueprintRewardPool(false, 12), ["base", "combo", "scoreDouble", "areaClear"]);
  assert.deepEqual(blueprintRewardPool(true, 26), ["base", "combo", "seconds", "scoreDouble", "areaClear"]);
  assert.deepEqual(blueprintRewardPool(true, 27), ["base", "combo", "seconds", "scoreDouble", "areaClear", "turnRed"]);
  assert.deepEqual(blueprintRewardPool(false, 27), ["base", "combo", "scoreDouble", "areaClear", "turnRed"]);
  assert.equal(blueprintRewardToast("base"), "永久基础 +2");
  assert.equal(blueprintRewardToast("combo"), "每球连击 +1");
  assert.equal(blueprintRewardToast("seconds"), "永久时钟 +1秒");
  assert.equal(blueprintRewardToast("scoreDouble"), "下一次进球得分 ×2");
  assert.equal(blueprintRewardToast("areaClear"), "点亮并消除周围方块");
  assert.equal(blueprintRewardToast("turnRed"), "相邻方块变为红色");
  assert.equal(BLUEPRINT_REWARD_UNLOCK.turnRed, 27);
  assert.equal(BLUEPRINT_KIND_UNLOCK.black, 21);
  const previous = getBlueprintAllowSeconds();
  setBlueprintAllowSeconds(false);
  try {
    for (let seed = 1; seed <= 80; seed++) {
      const events = clearIsolatedGreen(seed);
      assert.notEqual(events[0], "seconds");
      assert.equal(getBlueprintRewards().seconds, 0);
    }
  } finally {
    setBlueprintAllowSeconds(previous);
  }
});

test("下一次实体进球得分 ×2，连击数不加倍；两次是两球各 ×2；分身不兑现", () => {
  resetBlueprint(9);
  restoreBlueprintClock(clock({ scoreDoubleCharges: 2, pendingBonus: 3 }));
  assert.equal(getBlueprintScoreDoubleCharges(), 2);
  const ghost = applyBlueprintScoreDouble(10, false);
  assert.equal(ghost.score, 10);
  assert.equal(ghost.doubled, false);
  assert.equal(getBlueprintScoreDoubleCharges(), 2);
  const first = applyBlueprintScoreDouble(10, true);
  assert.equal(first.score, 20);
  assert.equal(first.doubled, true);
  assert.equal(first.multiplier, 2);
  assert.equal(getBlueprintScoreDoubleCharges(), 1);
  const second = applyBlueprintScoreDouble(7, true);
  assert.equal(second.score, 14);
  assert.equal(getBlueprintScoreDoubleCharges(), 0);
  const third = applyBlueprintScoreDouble(7, true);
  assert.equal(third.score, 7);
  assert.equal(third.doubled, false);

  resetBlueprint(10);
  restoreBlueprintClock(clock({ scoreDoubleCharges: 2, pendingBonus: 3 }));
  const settledGhost = settleBlueprintBasket(5, false);
  assert.equal(settledGhost.shown, 5);
  assert.equal(settledGhost.doubled, false);
  assert.equal(getBlueprintScoreDoubleCharges(), 2);
  assert.equal(getBlueprintClock().pendingBonus, 3);
  const settled = settleBlueprintBasket(5, true);
  assert.equal(settled.bonus, 3);
  assert.equal(settled.shown, 16);
  assert.equal(settled.doubled, true);
  assert.equal(getBlueprintScoreDoubleCharges(), 1);
});

test("时间球回溯还原双倍次数与黑块种类", () => {
  resetBlueprint(12);
  restoreBlueprintClock(clock({
    goals: 8,
    staticCells: [{ col: 4, row: 8, kind: "black" }, { col: 5, row: 8, kind: "green" }],
    dynamic: dyn({ cells: [{ col: 6, row: 9, kind: "black" }], stepSpan: 10 }),
    staticAge: 1,
    scoreDoubleCharges: 2,
    pendingBonus: 1,
  }));
  const shot = getBlueprintClock();
  assert.equal(shot.scoreDoubleCharges, 2);
  applyBlueprintScoreDouble(4, true);
  consumeBlueprintLitForHole();
  assert.equal(getBlueprintScoreDoubleCharges(), 1);
  assert.deepEqual(getBlueprintClock().staticCells, []);
  restoreBlueprintClock(shot);
  const back = getBlueprintClock();
  assert.equal(back.scoreDoubleCharges, 2);
  assert.deepEqual(back.staticCells.map((cell) => cell.kind), ["black", "green"]);
  assert.equal(back.dynamic?.cells[0]?.kind, "black");
  assert.equal(back.pendingBonus, 1);
});

test("周围 8 格含斜线；邻绿领奖但不二次范围消除；红引爆且不递归", () => {
  assert.equal(blueprintAreaNeighbors(5, 9).length, 8);
  assert.ok(blueprintAreaNeighbors(5, 9).some((cell) => cell.col === 6 && cell.row === 10));
  // 斜线邻块不挡住中心绿的单格消除，这样才能在点亮时触发周围消除。
  const center: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const diagWhite: BlueprintCellRef = { col: 6, row: 10, kind: "white" };
  const neighborGreen: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  const red: BlueprintCellRef = { col: 6, row: 8, kind: "red" };
  const redArm: BlueprintCellRef = { col: 6, row: 7 };
  const redBeyondGap: BlueprintCellRef = { col: 6, row: 5 };
  const collateralRed: BlueprintCellRef = { col: 7, row: 8, kind: "red" };
  const collateralArm: BlueprintCellRef = { col: 7, row: 7 };
  let found = false;
  for (let seed = 1; seed <= 200; seed++) {
    resetBlueprint(seed);
    restoreBlueprintClock(clock({
      seed,
      goals: 12,
      staticCells: [center, diagWhite, neighborGreen, red, redArm, redBeyondGap, collateralRed, collateralArm],
      staticAge: 1,
    }));
    const cleared = touchBlueprintCell(world, 5, 9);
    const events = drainBlueprintRewardEvents();
    if (events[0] !== "areaClear") continue;
    found = true;
    assert.ok(cleared >= 1);
    const after = getBlueprintClock();
    const live = (cell: { col: number; row: number }) =>
      after.staticCells.some((item) => item.col === cell.col && item.row === cell.row)
      || after.clearing.some((item) => item.col === cell.col && item.row === cell.row);
    assert.equal(live(diagWhite), true, "diagonal white entered clear (still retracting or gone from static)");
    assert.ok(!after.staticCells.some((item) => item.col === 6 && item.row === 10), "diagonal white left the field");
    assert.ok(!after.staticCells.some((item) => item.col === 6 && item.row === 8 && item.kind === "red"), "diagonal red cleared");
    assert.ok(!after.staticCells.some((item) => item.col === 6 && item.row === 7), "red cross extends up");
    assert.ok(after.staticCells.some((item) => item.col === 6 && item.row === 5), "gap stops red cross");
    assert.ok(!after.staticCells.some((item) => item.col === 7 && item.row === 8 && item.kind === "red"), "collateral red cleared");
    assert.ok(after.staticCells.some((item) => item.col === 7 && item.row === 7), "collateral red does not recurse");
    const areaEvents = events.filter((event) => event === "areaClear");
    assert.ok(areaEvents.length <= 1, "neighbor green must not chain a second area clear");
    assert.ok(events.length >= 1);
    break;
  }
  assert.equal(found, true, "should draw areaClear within 200 seeds");
});

test("邻绿抽到周围消除不再连锁", () => {
  const center: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const neighbor: BlueprintCellRef = { col: 6, row: 10, kind: "green" };
  const far: BlueprintCellRef = { col: 7, row: 11 };
  let sawNeighborReward = false;
  let chainedFar = false;
  for (let seed = 1; seed <= 240; seed++) {
    resetBlueprint(seed);
    restoreBlueprintClock(clock({ seed, goals: 12, staticCells: [center, neighbor, far], staticAge: 1 }));
    touchBlueprintCell(world, 5, 9);
    const events = drainBlueprintRewardEvents();
    if (events[0] !== "areaClear") continue;
    if (events.length >= 2) sawNeighborReward = true;
    if (events.length >= 2 && events[1] === "areaClear") {
      const after = getBlueprintClock();
      const farGone = !after.staticCells.some((cell) => cell.col === 7 && cell.row === 11)
        && after.clearing.some((cell) => cell.col === 7 && cell.row === 11);
      const farCleared = !after.staticCells.some((cell) => cell.col === 7 && cell.row === 11);
      if (farCleared) chainedFar = true;
    }
    if (sawNeighborReward && events.includes("areaClear") && events.length >= 2) {
      if (events[1] === "areaClear") break;
    }
  }
  assert.equal(sawNeighborReward, true);
  assert.equal(chainedFar, false);
});

test("黑块：踩亮/清段/8格/红十字都清不掉，并截断连续段", () => {
  const black: BlueprintCellRef = { col: 5, row: 9, kind: "black" };
  const left: BlueprintCellRef = { col: 4, row: 9 };
  const right: BlueprintCellRef = { col: 6, row: 9 };
  resetBlueprint(6);
  restoreBlueprintClock(clock({ staticCells: [black, left, right], staticAge: 1 }));
  assert.equal(blueprintCellLocked(4, 9), true);
  assert.equal(touchBlueprintCell(world, 5, 9), 0);
  assert.ok(getBlueprintClock().staticCells.some((cell) => cell.kind === "black"));
  assert.equal(getBlueprintClock().lit.includes("5:9"), false);
  // 同一行被锁：白块可点亮但不能清段。
  assert.equal(touchBlueprintCell(world, 4, 9), 0);
  const mid = getBlueprintClock();
  assert.ok(mid.staticCells.some((cell) => cell.col === 5 && cell.row === 9 && cell.kind === "black"));
  assert.ok(mid.staticCells.some((cell) => cell.col === 4 && cell.row === 9));
  assert.ok(mid.staticCells.some((cell) => cell.col === 6 && cell.row === 9));
  assert.equal(mid.lit.includes("4:9"), true);
  assert.equal(mid.pendingBonus, 0);
  assert.equal(touchBlueprintCell(world, 6, 9), 0);
  assert.equal(getBlueprintClock().pendingBonus, 0, "both lit whites remain row-locked");

  const red: BlueprintCellRef = { col: 5, row: 8, kind: "red" };
  const beyond: BlueprintCellRef = { col: 5, row: 10 };
  restoreBlueprintClock(clock({ staticCells: [red, black, beyond], staticAge: 1 }));
  // 触发红在锁定列上仍引爆，但实际黑块阻挡延伸。
  assert.equal(blueprintCellLocked(5, 8), true);
  const cross = blueprintRedCrossCells(5, 8);
  assert.ok(!cross.some((cell) => cell.col === 5 && cell.row === 9));
  assert.ok(!cross.some((cell) => cell.col === 5 && cell.row === 10));
  assert.equal(touchBlueprintCell(world, 5, 8), 1);
  const afterRed = getBlueprintClock();
  assert.ok(!afterRed.staticCells.some((cell) => cell.col === 5 && cell.row === 8 && cell.kind === "red"));
  assert.ok(afterRed.staticCells.some((cell) => cell.col === 5 && cell.row === 9 && cell.kind === "black"));
  assert.ok(afterRed.staticCells.some((cell) => cell.col === 5 && cell.row === 10));
});

test("叠层只走可清除的那一层，黑洞可以收走黑块", () => {
  const black: BlueprintCellRef = { col: 4, row: 8, kind: "black" };
  const white: BlueprintCellRef = { col: 4, row: 8, kind: "white" };
  restoreBlueprintClock(clock({
    staticCells: [black],
    dynamic: dyn({ cells: [white], stepSpan: 10 }),
    staticAge: 1,
  }));
  // 同格有黑则整格锁定：白层可被点亮但不能按层清走。
  assert.equal(touchBlueprintCell(world, 4, 8), 0);
  const after = getBlueprintClock();
  assert.ok(after.staticCells.some((cell) => cell.kind === "black" && cell.col === 4 && cell.row === 8));
  assert.equal((after.dynamic?.cells ?? []).some((cell) => cell.col === 4 && cell.row === 8 && cell.kind === "white"), true);
  assert.equal(after.lit.includes("4:8"), true);
  assert.equal(after.pendingBonus, 0);
  assert.equal(consumeBlueprintLitForHole(), 1);
  assert.deepEqual(getBlueprintClock().staticCells, []);
  assert.equal(getBlueprintClock().dynamic, null);
});

test("黑块可出现在动态组；未解锁种类不会生成", () => {
  let dynamicBlack = false;
  for (let serial = 0; serial < 200 && !dynamicBlack; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 90, serial, goals: 21, maxCount: 6 });
    if (batch.cells.some((cell) => cell.kind === "black")) dynamicBlack = true;
  }
  assert.equal(dynamicBlack, true);
  for (let goals = 3; goals < 9; goals++) {
    for (let serial = 0; serial < 40; serial++) {
      const batch = rollBlueprintBatch(world, { seed: 91, serial, goals });
      assert.ok(batch.cells.every((cell) => (cell.kind ?? "white") === "white"));
    }
  }
  for (let goals = 9; goals < 15; goals++) {
    for (let serial = 0; serial < 40; serial++) {
      const batch = rollBlueprintBatch(world, { seed: 92, serial, goals });
      assert.ok(batch.cells.every((cell) => cell.kind !== "red" && cell.kind !== "black"));
    }
  }
  for (let goals = 15; goals < 21; goals++) {
    for (let serial = 0; serial < 40; serial++) {
      const batch = rollBlueprintBatch(world, { seed: 93, serial, goals });
      assert.ok(batch.cells.every((cell) => cell.kind !== "black"));
    }
  }
});

test("数量曲线：前 3 球为 0，之后每 3 球 softMax +1，第 30 球封顶 10", () => {
  assert.equal(blueprintCountSoftMax(0), 0);
  for (const goals of [0, 1, 2]) {
    assert.equal(blueprintCountSoftMax(goals), 0);
    for (let i = 0; i <= 20; i++) assert.equal(blueprintSampleCount(goals, i / 20), 0);
  }
  const table: [number, number][] = [
    [3, 1], [5, 1], [6, 2], [8, 2], [9, 3], [11, 3], [12, 4], [14, 4],
    [15, 5], [17, 5], [18, 6], [20, 6], [21, 7], [23, 7], [24, 8], [26, 8],
    [27, 9], [29, 9], [30, 10], [40, 10],
  ];
  for (const [goals, soft] of table) {
    assert.equal(blueprintCountSoftMax(goals), soft, `softMax(${goals})`);
    if (soft === 1) {
      for (let i = 0; i <= 20; i++) assert.equal(blueprintSampleCount(goals, i / 20), 1);
    } else {
      assert.equal(blueprintSampleCount(goals, 1), soft);
      let maxSeen = 0;
      for (let i = 0; i <= 40; i++) maxSeen = Math.max(maxSeen, blueprintSampleCount(goals, i / 40));
      assert.ok(maxSeen <= soft);
    }
  }
  // 不再使用旧的前 5 球固定 1、每 2 球一跳，或第 16 球从 7 跳到 10。
  assert.equal(blueprintCountSoftMax(1), 0);
  assert.equal(blueprintCountSoftMax(16), 5);
  assert.notEqual(blueprintCountSoftMax(16), 10);
  const sums = { early: 0, late: 0 };
  for (let i = 0; i < 100; i++) {
    sums.early += blueprintSampleCount(8, i / 99);
    sums.late += blueprintSampleCount(30, i / 99);
  }
  assert.ok(sums.late > sums.early);
});

test("形状拼接：格数贴近目标、只落合法格，固定 seed 下比单形状更不单一", () => {
  const legal = new Set(blueprintLegalCells(world, null).map((cell) => `${cell.col}:${cell.row}`));
  let exact = 0;
  const combos = new Set<string>();
  let multiPiece = 0;
  for (let serial = 0; serial < 80; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 21, serial, goals: 16, ball: null, hoop: null });
    for (const cell of batch.cells) assert.ok(legal.has(`${cell.col}:${cell.row}`));
    assert.ok(batch.cells.length <= batch.target);
    assert.ok(batch.target <= BLUEPRINT_MAX_COUNT);
    if (batch.cells.length === batch.target) exact += 1;
    if (batch.pieces.length > 1) multiPiece += 1;
    combos.add(batch.pieces.map((piece) => piece.shape).join("+") || "empty");
  }
  assert.ok(exact >= 70, `exact=${exact}`);
  assert.ok(multiPiece > 0, "some batches should stitch more than one shape");
  assert.ok(combos.size >= 4, `combos=${[...combos].join(",")}`);
});


test("转红奖励：只改上下左右 4 格，白/绿/黑变红，已红保持，新红不引爆", () => {
  assert.equal(BLUEPRINT_TURN_RED_DELTAS.length, 4);
  assert.deepEqual(blueprintTurnRedNeighbors(5, 9), [
    { col: 5, row: 8 }, { col: 4, row: 9 }, { col: 6, row: 9 }, { col: 5, row: 10 },
  ]);
  assert.ok(!blueprintTurnRedNeighbors(5, 9).some((cell) => cell.col === 6 && cell.row === 10));
  const center: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const upWhite: BlueprintCellRef = { col: 5, row: 8, kind: "white" };
  const upBlack: BlueprintCellRef = { col: 5, row: 8, kind: "black" };
  const leftGreen: BlueprintCellRef = { col: 4, row: 9, kind: "green" };
  const rightBlack: BlueprintCellRef = { col: 6, row: 9, kind: "black" };
  const downRed: BlueprintCellRef = { col: 5, row: 10, kind: "red" };
  const diag: BlueprintCellRef = { col: 6, row: 10, kind: "white" };
  restoreBlueprintClock(clock({
    goals: 27,
    staticCells: [center, upWhite, leftGreen, rightBlack, downRed, diag],
    dynamic: dyn({ cells: [upBlack], stepSpan: 10 }),
    staticAge: 1,
    lit: ["5:8"],
  }));
  drainBlueprintRewardEvents();
  const cleared = applyBlueprintTurnRed(5, 9);
  const after = getBlueprintClock();
  const kindAt = (col: number, row: number) => (
    [...after.staticCells, ...(after.dynamic?.cells ?? [])]
      .filter((cell) => cell.col === col && cell.row === row)
      .map((cell) => cell.kind)
  );
  assert.deepEqual(kindAt(5, 8), ["red"]);
  assert.deepEqual(kindAt(4, 9), ["red"]);
  assert.deepEqual(kindAt(6, 9), ["red"]);
  assert.deepEqual(kindAt(5, 10), ["red"]);
  assert.deepEqual(kindAt(6, 10), ["white"], "diagonal stays white");
  assert.deepEqual(kindAt(5, 9), ["green"], "self stays until it is actually cleared");
  // 被转变的绿不领奖；新红不立刻引爆，下行的原红也不另清。
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.ok(after.staticCells.some((cell) => cell.col === 5 && cell.row === 10 && cell.kind === "red"));
  assert.ok(after.clearing.every((cell) => !(cell.col === 5 && cell.row === 10)));
  // 同格多层红只留一层。
  assert.deepEqual(kindAt(5, 8), ["red"]);
  assert.equal(after.pendingBonus, cleared);
});

test("转红可改黑：锁解除后已点亮白块会补判清段", () => {
  const a: BlueprintCellRef = { col: 7, row: 9 };
  const b: BlueprintCellRef = { col: 8, row: 9 };
  const lockBlack: BlueprintCellRef = { col: 5, row: 9, kind: "black" };
  restoreBlueprintClock(clock({
    goals: 27,
    staticCells: [lockBlack, a, b],
    staticAge: 1,
  }));
  assert.equal(blueprintCellLocked(7, 9), true);
  assert.equal(blueprintCellLocked(8, 9), true);
  assert.equal(touchBlueprintCell(world, 7, 9), 0);
  assert.equal(touchBlueprintCell(world, 8, 9), 0);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.equal(getBlueprintClock().lit.includes("7:9"), true);
  assert.equal(getBlueprintClock().lit.includes("8:9"), true);
  applyBlueprintTurnRed(5, 10); // 上邻是黑，把 (5,9) 黑改红
  const after = getBlueprintClock();
  assert.ok(!after.staticCells.some((cell) => cell.kind === "black"));
  assert.equal(blueprintCellLocked(7, 9, after), false);
  // 锁解除后，已点亮且中间有空挡与新红隔开的 (7,9)-(8,9) 成段，立刻缩回。
  assert.ok(!after.staticCells.some((cell) => cell.col === 7 && cell.row === 9));
  assert.ok(!after.staticCells.some((cell) => cell.col === 8 && cell.row === 9));
  assert.ok(after.pendingBonus >= 2);
});

test("行列锁：有黑的行和列可点亮不可清除，未锁定两侧可独立成段", () => {
  const black: BlueprintCellRef = { col: 5, row: 9, kind: "black" };
  // 黑锁 row 9 与 col 5。(4,8) 与 (6,8) 未被锁，中间 (5,8) 被列锁截断。
  const left: BlueprintCellRef = { col: 4, row: 8 };
  const mid: BlueprintCellRef = { col: 5, row: 8 };
  const right: BlueprintCellRef = { col: 6, row: 8 };
  const lockedGreen: BlueprintCellRef = { col: 6, row: 9, kind: "green" };
  const lockedRed: BlueprintCellRef = { col: 5, row: 7, kind: "red" };
  restoreBlueprintClock(clock({
    goals: 12,
    staticCells: [black, left, mid, right, lockedGreen, lockedRed],
    staticAge: 1,
  }));
  const lines = blueprintLockedLines();
  assert.equal(lines.rows.has(9), true);
  assert.equal(lines.cols.has(5), true);
  assert.equal(blueprintCellLocked(5, 8), true);
  assert.equal(blueprintCellLocked(4, 8), false);
  assert.equal(blueprintCellLocked(6, 8), false);
  assert.equal(touchBlueprintCell(world, 5, 8), 0);
  assert.equal(getBlueprintClock().lit.includes("5:8"), true);
  assert.ok(getBlueprintClock().staticCells.some((cell) => cell.col === 5 && cell.row === 8));
  // 未锁定两侧可独立成段（此处各是孤立格）。
  assert.equal(touchBlueprintCell(world, 4, 8), 1);
  assert.ok(!getBlueprintClock().staticCells.some((cell) => cell.col === 4 && cell.row === 8));
  assert.equal(touchBlueprintCell(world, 6, 8), 1);
  assert.ok(!getBlueprintClock().staticCells.some((cell) => cell.col === 6 && cell.row === 8));
  // 踩锁定绿仍无效；红块豁免锁。
  const pending = getBlueprintClock().pendingBonus;
  assert.equal(touchBlueprintCell(world, 6, 9), 0);
  assert.ok(getBlueprintClock().staticCells.some((cell) => cell.col === 6 && cell.row === 9 && cell.kind === "green"));
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.equal(touchBlueprintCell(world, 5, 7), 2);
  assert.ok(!getBlueprintClock().staticCells.some((cell) => cell.col === 5 && cell.row === 7 && cell.kind === "red"));
  assert.equal(getBlueprintClock().pendingBonus, pending + 2);
});

test("范围消除仍受锁；红十字穿过仅被远处黑锁住的目标", () => {
  const black: BlueprintCellRef = { col: 3, row: 9, kind: "black" };
  const center: BlueprintCellRef = { col: 5, row: 8, kind: "green" };
  const lockedWhite: BlueprintCellRef = { col: 4, row: 9 };
  const freeWhite: BlueprintCellRef = { col: 6, row: 7 };
  restoreBlueprintClock(clock({
    goals: 12,
    seed: 1,
    staticCells: [black, center, lockedWhite, freeWhite],
    staticAge: 1,
  }));
  // 中心绿在 (5,8)，对角/斜邻 (4,9) 被 row9 锁，(6,7) 未锁。中心正交无邻，可单格消除。
  let found = false;
  for (let seed = 1; seed <= 200; seed++) {
    restoreBlueprintClock(clock({
      seed,
      goals: 12,
      staticCells: [black, center, lockedWhite, freeWhite],
      staticAge: 1,
    }));
    touchBlueprintCell(world, 5, 8);
    const events = drainBlueprintRewardEvents();
    if (events[0] !== "areaClear") continue;
    found = true;
    const after = getBlueprintClock();
    assert.ok(after.staticCells.some((cell) => cell.col === 3 && cell.row === 9 && cell.kind === "black"));
    assert.ok(after.staticCells.some((cell) => cell.col === 4 && cell.row === 9), "locked white stays");
    assert.equal(after.lit.includes("4:9"), true, "locked white only lights");
    assert.ok(!after.staticCells.some((cell) => cell.col === 6 && cell.row === 7), "unlocked neighbor clears");
    break;
  }
  assert.equal(found, true);

  const red: BlueprintCellRef = { col: 7, row: 8, kind: "red" };
  const arm: BlueprintCellRef = { col: 6, row: 8 };
  const lockedArm: BlueprintCellRef = { col: 5, row: 8 };
  const beyond: BlueprintCellRef = { col: 4, row: 8 };
  restoreBlueprintClock(clock({
    goals: 12,
    staticCells: [black, red, arm, lockedArm, beyond],
    staticAge: 1,
  }));
  // black at (3,9) locks row 9 and col 3, not this row. Need a black that locks a cell on the cross.
  const colBlack: BlueprintCellRef = { col: 5, row: 11, kind: "black" };
  restoreBlueprintClock(clock({
    goals: 12,
    staticCells: [colBlack, red, arm, lockedArm, beyond],
    staticAge: 1,
  }));
  const cross = blueprintRedCrossCells(7, 8);
  assert.ok(cross.some((cell) => cell.col === 6 && cell.row === 8));
  assert.ok(cross.some((cell) => cell.col === 5 && cell.row === 8), "row/col lock is not a physical black");
  assert.ok(cross.some((cell) => cell.col === 4 && cell.row === 8));
  touchBlueprintCell(world, 7, 8);
  const after = getBlueprintClock();
  assert.ok(!after.staticCells.some((cell) => cell.col === 7 && cell.row === 8 && cell.kind === "red"));
  assert.ok(!after.staticCells.some((cell) => cell.col === 6 && cell.row === 8));
  assert.ok(!after.staticCells.some((cell) => cell.col === 5 && cell.row === 8), "locked arm clears in red cross");
  assert.ok(!after.staticCells.some((cell) => cell.col === 4 && cell.row === 8), "path extends beyond lock");
});

test("动态黑搬走后锁跟随；开洞仍能收黑", () => {
  const black: BlueprintCellRef = { col: 5, row: 9, kind: "black" };
  const stay: BlueprintCellRef = { col: 4, row: 9 };
  restoreBlueprintClock(clock({
    goals: 21,
    staticCells: [stay],
    dynamic: dyn({
      cells: [black],
      pending: [{ col: 5, row: 10, kind: "black" }],
      dir: 2,
      phase: "cross_out",
      age: BLUEPRINT_CROSS_RAISE - 0.01,
      raise: BLUEPRINT_CROSS_RAISE,
    }),
    staticAge: 1,
  }));
  assert.equal(blueprintCellLocked(4, 9), true);
  stepBlueprint(0.02, true, { ...aimAt(21), ballX: -400, ballY: -400 }, world);
  const moved = getBlueprintClock();
  assert.deepEqual(moved.dynamic?.cells.map((cell) => `${cell.col}:${cell.row}:${cell.kind}`), ["5:10:black"]);
  assert.equal(blueprintCellLocked(4, 9, moved), false, "old row unlocks");
  assert.equal(blueprintCellLocked(5, 10, moved), true, "new row locks");
  assert.equal(consumeBlueprintLitForHole(), moved.lit.includes("4:9") ? 1 : 0);
  assert.deepEqual(getBlueprintClock().staticCells, []);
  assert.equal(getBlueprintClock().dynamic, null);
});

test("开洞抽到转红只记事件，不再扫空场", () => {
  const green: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const neighbor: BlueprintCellRef = { col: 5, row: 8 };
  let found = false;
  for (let seed = 1; seed <= 240; seed++) {
    restoreBlueprintClock(clock({ seed, goals: 27, staticCells: [green, neighbor], staticAge: 1 }));
    assert.equal(consumeBlueprintLitForHole(), 0);
    const events = drainBlueprintRewardEvents();
    if (events[0] !== "turnRed") continue;
    found = true;
    assert.deepEqual(getBlueprintClock().staticCells, []);
    assert.equal(getBlueprintClock().clearing.length, 0);
    assert.equal(getBlueprintClock().pendingBonus, 0);
    break;
  }
  assert.equal(found, true, "should draw turnRed from a hole within 240 seeds");
});

test("actual < 9 清绿不抽奖；一分钟任何时期都不抽 seconds；27 才进转红", () => {
  const green: BlueprintCellRef = { col: 4, row: 8, kind: "green" };
  restoreBlueprintClock(clock({ seed: 3, goals: 8, staticCells: [green], staticAge: 1 }));
  assert.equal(touchBlueprintCell(world, 4, 8), 1);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.deepEqual(getBlueprintRewards(), { base: 0, combo: 0, seconds: 0 });

  const previous = getBlueprintAllowSeconds();
  setBlueprintAllowSeconds(false);
  try {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const events = clearIsolatedGreen(seed, 27);
      assert.equal(events.length, 1);
      assert.notEqual(events[0], "seconds");
      seen.add(events[0]!);
    }
    assert.ok(seen.has("turnRed"));
    assert.ok(seen.has("areaClear"));
    assert.ok(!seen.has("seconds"));
  } finally {
    setBlueprintAllowSeconds(previous);
  }
  for (let seed = 1; seed <= 80; seed++) {
    const events = clearIsolatedGreen(seed, 11);
    assert.notEqual(events[0], "areaClear");
    assert.notEqual(events[0], "turnRed");
  }
});


/** 从上方实体撞击指定凸块，覆盖 collideBlueprint → touch → beginLineClear → dropClearableLayers。 */
function collideRedCell(col: number, row: number) {
  const block = blueprintBlocks(world).find((cell) => cell.col === col && cell.row === row && cell.solid)!;
  assert.ok(block);
  const x = block.cell.x + block.cell.w / 2;
  const y = block.cell.y + 2;
  const ball = { x, y, vx: 0, vy: 500, r: 3 };
  assert.equal(collideBlueprint(world, ball, x, block.cell.y - 5), true);
}

test("红实体碰撞豁免行/列黑锁：红—白—黑—白只清黑前目标", () => {
  for (const vertical of [false, true]) {
    const ref = (i: number, kind: BlueprintCellRef["kind"] = "white"): BlueprintCellRef => ({
      col: 5 + (vertical ? 0 : i), row: 9 + (vertical ? i : 0), kind,
    });
    const cells = [ref(0, "red"), ref(1), ref(2, "black"), ref(3)];
    restoreBlueprintClock(clock({ goals: 21, staticCells: cells, staticAge: 1 }));
    assert.equal(blueprintCellLocked(5, 9), true);
    collideRedCell(5, 9);
    const after = getBlueprintClock();
    assert.deepEqual(after.staticCells, cells.slice(2), "black and everything behind it stay");
    assert.equal(after.pendingBonus, 2);
    assert.equal(after.clearing.length, 2);
  }
});

test("红十字四向独立，目标被远处黑锁住也清除，连带红不递归", () => {
  const red: BlueprintCellRef = { col: 5, row: 9, kind: "red" };
  const left: BlueprintCellRef = { col: 4, row: 9 };
  const leftBlack: BlueprintCellRef = { col: 3, row: 9, kind: "black" };
  const leftBeyond: BlueprintCellRef = { col: 2, row: 9 };
  const up: BlueprintCellRef = { col: 5, row: 8 };
  const upBeyondGap: BlueprintCellRef = { col: 5, row: 6 };
  const down: BlueprintCellRef = { col: 5, row: 10 };
  const rightRed: BlueprintCellRef = { col: 6, row: 9, kind: "red" };
  const right: BlueprintCellRef = { col: 7, row: 9 };
  const sideArm: BlueprintCellRef = { col: 6, row: 8 };
  const remoteBlack: BlueprintCellRef = { col: 5, row: 13, kind: "black" };
  const survivors = [leftBlack, leftBeyond, upBeyondGap, sideArm, remoteBlack];
  restoreBlueprintClock(clock({ goals: 21, staticCells: [red, left, up, down, rightRed, right, ...survivors], staticAge: 1 }));
  assert.equal(blueprintCellLocked(5, 8), true, "up target locked by distant black");
  assert.equal(blueprintCellLocked(7, 9), true, "right target locked by perpendicular black");
  collideRedCell(5, 9);
  const after = getBlueprintClock();
  assert.deepEqual(after.staticCells, survivors);
  assert.equal(after.pendingBonus, 6);
  assert.equal(after.clearing.length, 6);
});

test("红十字叠层按层清除：静态或动态黑层留下并挡住后方", () => {
  for (const blackInDynamic of [false, true]) {
    const red: BlueprintCellRef = { col: 5, row: 9, kind: "red" };
    const black: BlueprintCellRef = { col: 7, row: 9, kind: "black" };
    const overlay: BlueprintCellRef = { col: 7, row: 9, kind: "white" };
    const arm: BlueprintCellRef = { col: 6, row: 9 };
    const beyond: BlueprintCellRef = { col: 8, row: 9 };
    restoreBlueprintClock(clock({
      goals: 21, staticAge: 1,
      staticCells: [red, arm, beyond, blackInDynamic ? overlay : black],
      dynamic: dyn({ cells: [blackInDynamic ? black : overlay], stepSpan: 10 }),
    }));
    collideRedCell(5, 9);
    const after = getBlueprintClock();
    const layers = [...after.staticCells, ...(after.dynamic?.cells ?? [])];
    assert.ok(layers.some((cell) => cell.col === 7 && cell.row === 9 && cell.kind === "black"));
    assert.ok(!layers.some((cell) => cell.col === 7 && cell.row === 9 && cell.kind === "white"));
    assert.ok(layers.some((cell) => cell.col === 8 && cell.row === 9));
    assert.equal(after.pendingBonus, 3, "black itself never grants clear points");
  }
});

test("绿范围锁保留：锁定绿红不清不触发，只有已激活红十字可豁免目标锁", () => {
  const center: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const black: BlueprintCellRef = { col: 3, row: 8, kind: "black" };
  const lockedWhite: BlueprintCellRef = { col: 4, row: 8 };
  const lockedGreen: BlueprintCellRef = { col: 5, row: 8, kind: "green" };
  const lockedRed: BlueprintCellRef = { col: 6, row: 8, kind: "red" };
  let found = false;
  for (let seed = 1; seed <= 200; seed++) {
    restoreBlueprintClock(clock({ seed, goals: 12, staticCells: [center, black, lockedWhite, lockedGreen, lockedRed], staticAge: 1, lit: ["5:8"] }));
    // 锁定邻格不参与清段，中心绿可作为孤立格触发范围奖励。
    touchBlueprintCell(world, 5, 9);
    const events = drainBlueprintRewardEvents();
    if (events[0] !== "areaClear") continue;
    found = true;
    assert.deepEqual(events, ["areaClear"]);
    const after = getBlueprintClock();
    assert.deepEqual(after.staticCells, [black, lockedWhite, lockedGreen, lockedRed]);
    assert.equal(after.pendingBonus, 1);
    assert.ok(after.lit.includes("4:8"));
    break;
  }
  assert.equal(found, true);
});


test("绿范围激活未锁红后，十字目标豁免锁，但同波普通范围目标不豁免", () => {
  const center: BlueprintCellRef = { col: 5, row: 9, kind: "green" };
  const red: BlueprintCellRef = { col: 6, row: 8, kind: "red" };
  const lockedTarget: BlueprintCellRef = { col: 7, row: 8 };
  const beyond: BlueprintCellRef = { col: 8, row: 8 };
  const lockedArea: BlueprintCellRef = { col: 4, row: 8 };
  const blacks: BlueprintCellRef[] = [
    { col: 7, row: 6, kind: "black" }, { col: 4, row: 11, kind: "black" },
  ];
  let found = false;
  for (let seed = 1; seed <= 200; seed++) {
    restoreBlueprintClock(clock({ seed, goals: 12, staticCells: [center, red, lockedTarget, beyond, lockedArea, ...blacks], staticAge: 1 }));
    assert.equal(blueprintCellLocked(6, 8), false);
    assert.equal(blueprintCellLocked(7, 8), true);
    assert.equal(blueprintCellLocked(4, 8), true);
    touchBlueprintCell(world, 5, 9);
    if (drainBlueprintRewardEvents()[0] !== "areaClear") continue;
    found = true;
    const after = getBlueprintClock();
    assert.deepEqual(after.staticCells, [lockedArea, ...blacks]);
    assert.ok(after.lit.includes("4:8"));
    assert.equal(after.pendingBonus, 4);
    break;
  }
  assert.equal(found, true);
});


test("触发红自身叠黑：只清红层，黑层保留且不向外穿透", () => {
  const red: BlueprintCellRef = { col: 5, row: 9, kind: "red" };
  const black: BlueprintCellRef = { col: 5, row: 9, kind: "black" };
  const arm: BlueprintCellRef = { col: 6, row: 9 };
  restoreBlueprintClock(clock({ goals: 21, staticAge: 1, staticCells: [black, arm], dynamic: dyn({ cells: [red], stepSpan: 10 }) }));
  collideRedCell(5, 9);
  const after = getBlueprintClock();
  assert.deepEqual(after.staticCells, [black, arm]);
  assert.equal(after.dynamic, null);
  assert.equal(after.pendingBonus, 1);
});


test("数量均匀抽样：安全边界映射到 1/softMax，所有合法整数都有等宽区间", () => {
  for (let soft = 1; soft <= 10; soft++) {
    const actual = 3 * soft;
    assert.equal(blueprintCountSoftMax(actual), soft);
    for (const roll of [-1, 0, NaN, Infinity, -Infinity]) {
      assert.equal(blueprintSampleCount(actual, roll), 1, `safe low: soft=${soft}, roll=${roll}`);
    }
    for (const roll of [1 - Number.EPSILON, 1, 2]) {
      assert.equal(blueprintSampleCount(actual, roll), soft);
    }
    const seen = new Set<number>();
    for (let count = 1; count <= soft; count++) {
      // 每一等宽区间的内部多点都必须落在同一个整数，不采用幂偏置。
      for (const fraction of [0.01, 0.25, 0.5, 0.75, 0.99]) {
        const got = blueprintSampleCount(actual, (count - 1 + fraction) / soft);
        assert.equal(got, count);
        seen.add(got);
      }
    }
    assert.deepEqual([...seen], Array.from({ length: soft }, (_, i) => i + 1));
  }
  for (const actual of [0, 1, 2]) {
    for (const roll of [-1, 0, 0.5, 1, 2, NaN]) assert.equal(blueprintSampleCount(actual, roll), 0);
  }
});

test("固定种子大样本：高进球数抽样均匀分散，不随 actual 越来越接近 10", (t) => {
  // 测试用 LCG；只验证抽样函数，不改游戏 RNG，不实现轮换或保底。
  let state = 0x39c0ffee;
  const bins = Array<number>(10).fill(0);
  const samples = 20000;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const roll = state / 0x100000000;
    const count = blueprintSampleCount(30, roll);
    assert.equal(blueprintSampleCount(300, roll), count);
    assert.equal(blueprintSampleCount(30000, roll), count);
    bins[count - 1]! += 1;
    total += count;
  }
  // 留足余量的确定性断言；每桶约 10%，不是游戏里的硬性配额。
  for (const bin of bins) assert.ok(bin > 1700 && bin < 2300, `bins=${bins}`);
  const mean = total / samples;
  assert.ok(mean > 5.35 && mean < 5.65);
  t.diagnostic(JSON.stringify({ seed: "0x39c0ffee", samples, actual: [30, 300, 30000], bins, mean }));
});

test("实际换批：静态与形状只填均匀抽到的目标，不强行补到 softMax", (t) => {
  const bins = Array<number>(10).fill(0);
  for (let serial = 0; serial < 800; serial++) {
    const actual = serial % 2 === 0 ? 30 : 300;
    const aim = { ...aimAt(actual), ballX: -400, ballY: -400 };
    const opts = { seed: 39, serial: serial + 1, goals: actual, ball: { x: -400, y: -400 }, hoop: { x: aim.hoopX, y: aim.hoopY } };
    const batch = rollBlueprintBatch(world, opts);
    assert.ok(batch.target >= 1 && batch.target <= 10);
    assert.equal(batch.cells.length, batch.target, "ample legal space fills sampled target only");
    restoreBlueprintClock(clock({ seed: 39, goals: actual - 1, serial, staticCells: [], dynamic: null }));
    stepBlueprint(0, true, aim, world);
    const after = getBlueprintClock();
    const total = after.staticCells.length + (after.dynamic?.cells.length ?? 0);
    assert.equal(total, batch.target);
    assert.ok(total <= blueprintCountSoftMax(actual));
    bins[total - 1]! += 1;
  }
  assert.ok(bins.every((n) => n > 40 && n < 120), `real batch bins=${bins}`);
  const mean = bins.reduce((sum, n, i) => sum + n * (i + 1), 0) / 800;
  t.diagnostic(JSON.stringify({ layoutSeed: 39, samples: 800, actual: [30, 300], bins, mean }));
  // 含开启与各级上限的实际路径，而不只测试满上限时的抽样函数。
  for (let actual = 0; actual <= 35; actual++) {
    resetBlueprint(39);
    stepBlueprint(0, true, { ...aimAt(actual), ballX: -400, ballY: -400 }, world);
    const after = getBlueprintClock();
    const total = after.staticCells.length + (after.dynamic?.cells.length ?? 0);
    assert.ok(total <= blueprintCountSoftMax(actual), `actual=${actual}, total=${total}`);
    if (actual < 3) assert.equal(total, 0);
    if (actual >= 3 && actual <= 5) assert.equal(total, 1);
  }
});

test("实际换批：保留动态扣除占用，小抽样静态为 0，不补满或强摘动态", (t) => {
  const legal = blueprintLegalCells(world, null);
  let retainedSmallSample = 0;
  let retainedWithStatic = 0;
  let despawned = 0;
  for (const size of [1, 4, 8, 10]) {
    const cells = legal.slice(0, size).map(({ col, row }) => ({ col, row, kind: "white" as const }));
    for (let seed = 1; seed <= 240; seed++) {
      const aim = { ...aimAt(31), ballX: -400, ballY: -400 };
      const target = rollBlueprintBatch(world, { seed, serial: 6, goals: 31, ball: { x: -400, y: -400 }, hoop: { x: aim.hoopX, y: aim.hoopY } }).target;
      restoreBlueprintClock(clock({ seed, goals: 30, serial: 5, staticCells: [], dynamic: dyn({ cells, stepSpan: 10 }) }));
      stepBlueprint(0, true, aim, world);
      const after = getBlueprintClock();
      const kept = after.dynamic?.cells.length ?? 0;
      const total = after.staticCells.length + kept;
      assert.ok(total <= blueprintCountSoftMax(31));
      if (kept && after.dynamic!.phase === "hold") {
        assert.deepEqual(after.dynamic!.cells, cells, "smaller sample must not trim/despawn kept group");
        assert.equal(after.staticCells.length, Math.max(0, target - size));
        assert.equal(total, Math.max(target, size));
        if (target < size) {
          retainedSmallSample++;
          assert.equal(after.staticCells.length, 0);
        }
        if (target > size) retainedWithStatic++;
      } else {
        despawned++;
        assert.equal(total, target, "despawn frees occupancy, but does not refill to cap");
      }
    }
  }
  assert.ok(retainedSmallSample > 0);
  assert.ok(retainedWithStatic > 0);
  assert.ok(despawned > 0);
  t.diagnostic(JSON.stringify({ samples: 960, retainedSmallSample, retainedWithStatic, despawned }));
});

test("保留大动态密度调查：不改消失式，记录固定种子 10 格组的续存换批数", (t) => {
  const cells = blueprintLegalCells(world, null).slice(0, 10).map(({ col, row }) => ({ col, row, kind: "white" as const }));
  const histogram: Record<number, number> = {};
  for (let seed = 1; seed <= 500; seed++) {
    restoreBlueprintClock(clock({ seed, goals: 30, serial: 5, staticCells: [], dynamic: dyn({ cells, stepSpan: 10 }) }));
    let survived = 0;
    for (let actual = 31; actual <= 50; actual++) {
      stepBlueprint(0, true, { ...aimAt(actual), ballX: -400, ballY: -400 }, world);
      const after = getBlueprintClock();
      if (!after.dynamic || after.dynamic.phase === "raise") break;
      assert.equal(after.dynamic.cells.length, 10);
      assert.equal(after.staticCells.length, 0, "retained full group leaves no static budget");
      survived++;
    }
    histogram[survived] = (histogram[survived] ?? 0) + 1;
  }
  // 统计仅用于验证/调查，不给游戏增加硬性轮换；不对最长续存次数作概率断言。
  assert.equal(Object.values(histogram).reduce((sum, n) => sum + n, 0), 500);
  assert.equal(blueprintDespawnChance(31), 0.85);
  t.diagnostic(JSON.stringify({ samples: 500, groupSize: 10, continuedRefreshes: histogram }));
});


/** 独立复算现有确定性掷签，只用于核对实际 stepBlueprint 的 .45/.85 概率门。 */
function dynamicTestUnit(seed: number, serial: number, channel: number) {
  const n = Math.sin(seed * 12.9898 + (serial + 1) * 78.233 + (channel + 1) * 39.425) * 43758.5453;
  return n - Math.floor(n);
}

function stepFromNoDynamic(seed: number, actual: number) {
  resetBlueprint(seed);
  restoreBlueprintClock(clock({ seed, goals: actual - 1, serial: 5, staticCells: [], dynamic: null }));
  assert.equal(getBlueprintClock().dynamic, null, "start from a genuinely empty dynamic slot");
  const aim = aimAt(actual);
  const target = rollBlueprintBatch(world, {
    seed, serial: 6, goals: actual,
    ball: { x: aim.ballX, y: aim.ballY }, hoop: { x: aim.hoopX, y: aim.hoopY },
  }).target;
  stepBlueprint(0, true, aim, world);
  return { after: getBlueprintClock(), target };
}

test("实际空动态槽换批：原概率成功会新生，概率失败不生，合计不越均匀样本", (t) => {
  for (const actual of [6, 9, 15, 30, 100]) {
    let spawned = 0, eligible = 0, failedChance = 0;
    let firstSpawnSeed = 0, firstFailedChanceSeed = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { after, target } = stepFromNoDynamic(seed, actual);
      const chance = dynamicTestUnit(seed, 6, 10);
      const shouldSpawn = target > 1 && chance < 0.45;
      assert.equal(Boolean(after.dynamic), shouldSpawn, `actual=${actual}, seed=${seed}, want=${target}, roll=${chance}`);
      const count = after.staticCells.length + (after.dynamic?.cells.length ?? 0);
      assert.equal(count, target, "ample legal positions fill only sampled combined target");
      assert.ok(count <= blueprintCountSoftMax(actual));
      if (target > 1) eligible++;
      if (after.dynamic) {
        spawned++;
        firstSpawnSeed ||= seed;
        assert.ok(after.staticCells.length >= 1);
        const keys = new Set(after.dynamic.cells.map((cell) => `${cell.col}:${cell.row}`));
        assert.ok(after.staticCells.every((cell) => !keys.has(`${cell.col}:${cell.row}`)), "new dynamic positions reserved before static fill");
        const legal = new Set(blueprintLegalCells(world, { x: aimAt(actual).ballX, y: aimAt(actual).ballY }).map((cell) => `${cell.col}:${cell.row}`));
        for (const key of keys) assert.ok(legal.has(key));
      } else if (target > 1 && chance >= 0.45) {
        failedChance++;
        firstFailedChanceSeed ||= seed;
      }
    }
    assert.ok(spawned > 0 && failedChance > 0);
    t.diagnostic(JSON.stringify({ actual, trials: 300, eligible, spawned, failedChance, firstSpawnSeed, firstFailedChanceSeed }));
  }
});

test("实际空动态槽：softMax 0 没块、softMax 1 只一静态，want=1 也不额外生动态", () => {
  for (const actual of [0, 1, 2, 3, 4, 5]) {
    for (let seed = 1; seed <= 60; seed++) {
      const { after, target } = stepFromNoDynamic(seed, actual);
      assert.equal(after.dynamic, null);
      assert.equal(after.staticCells.length, target);
      assert.equal(target, actual < 3 ? 0 : 1);
    }
  }
  let checked = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const { after, target } = stepFromNoDynamic(seed, 30);
    if (target !== 1 || dynamicTestUnit(seed, 6, 10) >= 0.45) continue;
    checked++;
    assert.equal(after.dynamic, null, "even a successful chance roll cannot exceed want=1");
    assert.equal(after.staticCells.length, 1);
  }
  assert.ok(checked > 0);
});

test("从空槽真实新生的动态组会升起可见并继续挪移，不只是预载快照", (t) => {
  let found = false;
  for (let seed = 1; seed <= 100 && !found; seed++) {
    const { after } = stepFromNoDynamic(seed, 9);
    if (!after.dynamic) continue;
    const aim = aimAt(9);
    assert.equal(after.dynamic.phase, "raise");
    stepBlueprint(BLUEPRINT_RAISE, true, aim, world);
    const raised = getBlueprintClock();
    assert.equal(raised.dynamic?.phase, "hold");
    const visible = blueprintBlocks(world).filter((block) => block.dynamic);
    assert.equal(visible.length, raised.dynamic!.cells.length);
    assert.ok(visible.every((block) => block.extend > 0.99 && block.solid));
    const before = raised.dynamic!.cells.map((cell) => `${cell.col}:${cell.row}`);
    stepBlueprint(raised.dynamic!.stepSpan + 0.01, true, aim, world);
    const moving = getBlueprintClock();
    if (moving.dynamic?.phase !== "cross_out") continue;
    assert.ok(moving.dynamic.pending.length > 0);
    stepBlueprint(moving.dynamic.raise, true, aim, world);
    const landed = getBlueprintClock();
    assert.equal(landed.dynamic?.phase, "cross_in");
    const to = landed.dynamic!.cells.map((cell) => `${cell.col}:${cell.row}`);
    assert.notDeepEqual(to, before);
    stepBlueprint(landed.dynamic!.raise, true, aim, world);
    assert.ok(blueprintBlocks(world).some((block) => block.dynamic && block.extend > 0.99));
    found = true;
    t.diagnostic(JSON.stringify({ movingNewbornSeed: seed, actual: 9, from: before, to }));
  }
  assert.equal(found, true);
});

test("真实新生组按原消失式离开后，同次换批可按原概率重新生成", (t) => {
  let found = false;
  for (let seed = 1; seed <= 300 && !found; seed++) {
    const { after } = stepFromNoDynamic(seed, 30);
    if (!after.dynamic) continue;
    const aim = aimAt(31);
    const target = rollBlueprintBatch(world, {
      seed, serial: 7, goals: 31,
      ball: { x: aim.ballX, y: aim.ballY }, hoop: { x: aim.hoopX, y: aim.hoopY },
    }).target;
    const despawn = dynamicTestUnit(seed, 7, 9);
    const spawn = dynamicTestUnit(seed, 7, 10);
    if (!(target > 1 && despawn < blueprintDespawnChance(31) && spawn < 0.45)) continue;
    stepBlueprint(BLUEPRINT_RAISE, true, aimAt(30), world);
    assert.equal(getBlueprintClock().dynamic?.phase, "hold");
    const old = getBlueprintClock();
    restoreBlueprintClock({ ...old, lit: old.dynamic!.cells.map((cell) => `${cell.col}:${cell.row}`) });
    stepBlueprint(0, true, aim, world);
    const next = getBlueprintClock();
    assert.equal(next.dynamic?.phase, "raise", "a new group, not retained old hold phase");
    assert.equal(next.dynamic?.age, 0);
    assert.equal(next.serial, 7);
    assert.equal(next.staticCells.length + next.dynamic!.cells.length, target);
    assert.ok(next.staticCells.length + next.dynamic!.cells.length <= blueprintCountSoftMax(31));
    assert.deepEqual(next.lit, [], "new group starts unlit");
    found = true;
    t.diagnostic(JSON.stringify({ regeneratedSeed: seed, actual: 31, despawnRoll: despawn, spawnRoll: spawn, target, dynamicCount: next.dynamic!.cells.length }));
  }
  assert.equal(found, true);
});
