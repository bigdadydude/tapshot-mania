import assert from "node:assert/strict";
import test from "node:test";
import { getScene, SCENE_LABELS, setScene } from "./scenes.ts";
import {
  BLUEPRINT_BALL_CLEAR,
  BLUEPRINT_BLOCK_SIZE,
  BLUEPRINT_BOUNCE_CLEAR,
  BLUEPRINT_DESPAWN_BASE,
  BLUEPRINT_DESPAWN_CAP,
  BLUEPRINT_DESPAWN_PER_GOAL,
  BLUEPRINT_FLOOR_SPREAD,
  BLUEPRINT_HIT_EXTEND,
  BLUEPRINT_MAX_COUNT,
  BLUEPRINT_MAX_LIGHTNESS,
  BLUEPRINT_MULTI_PER_GOAL,
  BLUEPRINT_CROSS_RAISE,
  BLUEPRINT_RAISE,
  BLUEPRINT_SHAPES,
  blueprintBlocks,
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
  blueprintJumpClearY,
  blueprintLegalCells,
  blueprintNearBall,
  blueprintOnShotPath,
  blueprintProtrudingCells,
  blueprintQuota,
  blueprintColClears,
  blueprintRowClears,
  blueprintSampleCount,
  blueprintShadowAlpha,
  blueprintShadowBox,
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
  collideBlueprint,
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
    const batch = rollBlueprintBatch(world, { seed: 1, serial, goals: 1, ball: null, hoop: null });
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

test("首球前不凸出；第 1 球 1 格；进球越多越容易复数", () => {
  assert.equal(BLUEPRINT_RAISE, 0.35);
  assert.equal(BLUEPRINT_MULTI_PER_GOAL, 0.12);
  assert.equal(blueprintSampleCount(0, 0), 0);
  assert.equal(blueprintSampleCount(0, 1), 0);
  assert.equal(blueprintSampleCount(1, 0), 1);
  assert.equal(blueprintSampleCount(1, 1), 1);
  assert.equal(rollBlueprintBatch(world, { seed: 2, serial: 0, goals: 0, ball: null, hoop: null }).cells.length, 0);
  for (let serial = 0; serial < 24; serial++) {
    const batch = rollBlueprintBatch(world, { seed: 7, serial, goals: 1, ball: null, hoop: null });
    assert.equal(batch.cells.length, 1);
    assert.equal(batch.duration, BLUEPRINT_RAISE);
  }
  let multiAtLow = 0;
  let multiAtHigh = 0;
  const samples = 80;
  for (let serial = 0; serial < samples; serial++) {
    if (blueprintSampleCount(2, serial / samples) > 1) multiAtLow += 1;
    if (blueprintSampleCount(12, serial / samples) > 1) multiAtHigh += 1;
  }
  assert.ok(multiAtHigh > multiAtLow, `high=${multiAtHigh} low=${multiAtLow}`);
  assert.ok(multiAtHigh > samples * 0.45);
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
  const first = getBlueprintClock();
  assert.equal(first.goals, 1);
  assert.equal(first.staticCells.length, 1);
  assert.equal(first.cells.length, 1);
  assert.equal(first.staticRaise, BLUEPRINT_RAISE);
  stepBlueprint(2, true, { ...aim, goals: 1 }, world);
  const held = getBlueprintClock();
  assert.deepEqual(held.staticCells, first.staticCells);
  assert.equal(held.serial, first.serial);
  assert.ok(held.staticAge > BLUEPRINT_RAISE);
  assert.equal(blueprintExtend(held.staticAge, held.staticRaise), 1);

  stepBlueprint(0.016, true, { ...aim, goals: 2 }, world);
  const next = getBlueprintClock();
  assert.equal(next.goals, 2);
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
  const aim = aimAt(1);
  let saw = false;
  for (let s = 1; s < 40 && !saw; s++) {
    resetBlueprint(s);
    stepBlueprint(0, true, aim, world);
    const before = getBlueprintClock();
    const next = rollBlueprintBatch(world, {
      seed: before.seed,
      serial: before.serial + 1,
      goals: 2,
      ball: { x: aim.ballX, y: aim.ballY },
      hoop: { x: aim.hoopX, y: aim.hoopY },
    });
    const hit = next.cells[0];
    if (!hit) continue;
    const group = [hit, { col: hit.col + 1, row: hit.row }];
    restoreBlueprintClock({
      ...before,
      dynamic: dyn({ cells: group, phase: "hold", age: 0.2 }),
    });
    stepBlueprint(0, true, aimAt(2), world);
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
    const goals = serial % 5 === 0 ? 1 : 6;
    const batch = rollBlueprintBatch(world, { seed: 11, serial, goals, ball: null, hoop: null });
    seen.add(batch.shape);
    assert.ok(batch.cells.length <= 10);
    if (!batch.anchor) continue;
    if (batch.cells.length === 1) {
      single = true;
      continue;
    }
    const full = blueprintStamp(batch.shape, batch.length, batch.variant, batch.anchor);
    assert.ok(full.length <= BLUEPRINT_MAX_COUNT);
    const keys = new Set(full.map((cell) => `${cell.col}:${cell.row}`));
    for (const cell of batch.cells) assert.ok(keys.has(`${cell.col}:${cell.row}`));
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
    const batch = rollBlueprintBatch(world, { seed: 5, serial, goals: 4, ball, hoop });
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
