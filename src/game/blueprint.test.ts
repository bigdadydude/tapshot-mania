import assert from "node:assert/strict";
import test from "node:test";
import { getScene, SCENE_LABELS, setScene } from "./scenes.ts";
import {
  BLUEPRINT_BALL_CLEAR,
  BLUEPRINT_BOUNCE_CLEAR,
  BLUEPRINT_EXTEND_CAP,
  BLUEPRINT_EXTEND_MIN,
  BLUEPRINT_EXTEND_PER_GOAL,
  BLUEPRINT_FLOOR_SPREAD,
  BLUEPRINT_HIT_EXTEND,
  BLUEPRINT_MAX_COUNT,
  BLUEPRINT_MAX_LIGHTNESS,
  BLUEPRINT_SHAPES,
  blueprintBlocks,
  blueprintCellPixels,
  blueprintExtend,
  blueprintExtendSpan,
  blueprintFillAlpha,
  blueprintFloorDepthX,
  blueprintFloorRowY,
  blueprintGrid,
  blueprintJumpClearY,
  blueprintLegalCells,
  blueprintNearBall,
  blueprintOnShotPath,
  blueprintQuota,
  blueprintSampleDuration,
  blueprintShapeOffsets,
  blueprintStamp,
  blueprintVanishingPoint,
  clipBlueprintCells,
  collideBlueprint,
  getBlueprintClock,
  resetBlueprint,
  restoreBlueprintClock,
  rollBlueprintBatch,
  stepBlueprint,
  type BlueprintCellRef,
  type BlueprintClock,
} from "./blueprint.ts";

function makeWorld(w = 390, h = 844) {
  const ballR = Math.max(17, Math.min(w, h) * 0.05);
  return { w, h, floorY: h * 0.765, ballR, hoopInner: Math.max(22, ballR * 1.42) };
}

const world = makeWorld();

function clock(partial: Partial<BlueprintClock> & Pick<BlueprintClock, "cells" | "cycle">): BlueprintClock {
  return {
    seed: 1,
    elapsed: 0,
    goals: 0,
    duration: BLUEPRINT_EXTEND_MIN,
    serial: 1,
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
    const batch = rollBlueprintBatch(world, { seed: 1, serial, goals: 0, ball: null, hoop: null });
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
  const shot = aimAt(0);
  for (let serial = 0; serial < 40; serial++) {
    const batch = rollBlueprintBatch(world, {
      seed: 3,
      serial,
      goals: serial,
      ball: { x: shot.ballX, y: shot.ballY },
      hoop: { x: shot.hoopX, y: shot.hoopY },
    });
    assert.ok(batch.cells.length <= BLUEPRINT_MAX_COUNT);
    assert.ok(batch.cells.length <= blueprintShapeOffsets(batch.shape, batch.length).length);
    const blocks = blueprintBlocks(world, clock({ cells: batch.cells, cycle: batch.duration / 2, duration: batch.duration }));
    assert.ok(blocks.length <= BLUEPRINT_MAX_COUNT);
  }
});

test("凸出时长从 1 秒起，每球加 0.2 秒，封顶 6 秒", () => {
  assert.equal(BLUEPRINT_EXTEND_MIN, 1);
  assert.equal(BLUEPRINT_EXTEND_PER_GOAL, 0.2);
  assert.equal(BLUEPRINT_EXTEND_CAP, 6);
  assert.deepEqual(blueprintExtendSpan(0), { min: 1, max: 1 });
  assert.equal(blueprintSampleDuration(0, 0), 1);
  assert.equal(blueprintSampleDuration(0, 0.4), 1);
  assert.equal(blueprintSampleDuration(0, 1), 1);
  assert.deepEqual(blueprintExtendSpan(1), { min: 1, max: 1.2 });
  assert.equal(blueprintSampleDuration(1, 0), 1);
  assert.equal(blueprintSampleDuration(1, 1), 1.2);
  assert.equal(blueprintExtendSpan(5).max, 2);
  assert.equal(blueprintExtendSpan(25).max, 6);
  assert.equal(blueprintExtendSpan(80).max, 6);
  assert.equal(blueprintSampleDuration(80, 1), 6);
  assert.equal(blueprintSampleDuration(-3, 1), 1);
  assert.equal(blueprintExtend(0, 1), 0);
  assert.ok(Math.abs(blueprintExtend(0.5, 1) - 1) < 1e-6);
  assert.equal(blueprintExtend(1, 1), 0);
  assert.ok(blueprintExtend(4, 4) < 1e-6);
  for (const goals of [0, 1, 4, 25]) {
    const span = blueprintExtendSpan(goals);
    for (let serial = 0; serial < 8; serial++) {
      const batch = rollBlueprintBatch(world, { seed: 9, serial, goals, ball: null, hoop: null });
      assert.ok(batch.duration >= span.min - 1e-9);
      assert.ok(batch.duration <= span.max + 1e-9);
    }
  }
});

test("一批会缩回，中途进球不改本批时长", () => {
  resetBlueprint(4);
  const aim = aimAt(0);
  stepBlueprint(0.016, true, aim, world);
  const first = getBlueprintClock();
  assert.equal(first.goals, 0);
  assert.equal(first.duration, 1);
  assert.ok(first.cells.length >= 1);
  assert.ok(first.cells.length <= BLUEPRINT_MAX_COUNT);
  stepBlueprint(0.2, true, { ...aim, goals: 40 }, world);
  const mid = getBlueprintClock();
  assert.deepEqual(mid.cells, first.cells);
  assert.equal(mid.duration, first.duration);
  assert.equal(mid.goals, 0);
  assert.equal(mid.serial, first.serial);
  assert.ok(blueprintExtend(mid.cycle, mid.duration) > 0);
  stepBlueprint(first.duration, true, { ...aim, goals: 4 }, world);
  const next = getBlueprintClock();
  assert.equal(next.serial, first.serial + 1);
  assert.equal(next.goals, 4);
  assert.ok(next.duration >= 1);
  assert.ok(next.duration <= blueprintExtendSpan(4).max + 1e-9);
  assert.ok(next.cycle < next.duration);
  assert.ok(blueprintExtend(next.duration, next.duration) < 1e-6);
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
    const batch = rollBlueprintBatch(world, { seed: 11, serial, goals: 2, ball: null, hoop: null });
    seen.add(batch.shape);
    assert.ok(batch.cells.length <= 10);
    if (!batch.anchor) continue;
    const full = blueprintStamp(batch.shape, batch.length, batch.variant, batch.anchor);
    assert.ok(full.length <= BLUEPRINT_MAX_COUNT);
    const keys = new Set(full.map((cell) => `${cell.col}:${cell.row}`));
    for (const cell of batch.cells) assert.ok(keys.has(`${cell.col}:${cell.row}`));
    if (batch.cells.length === 1) single = true;
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
    const batch = rollBlueprintBatch(world, { seed: 5, serial, goals: 1, ball, hoop });
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
    const placed = rollBlueprintBatch(sample, { seed: 3, serial: 2, goals: 0, ball: { x: sample.w * 0.5, y: sample.floorY - sample.ballR }, hoop: { x: sample.w * 0.2, y: sample.h * 0.4 } });
    for (const ref of placed.cells) {
      const rect = cellRect(ref, sample);
      assert.ok(rect.y + rect.h < sample.floorY - sample.ballR);
    }
  }
});

test("格子位置不动，凸出后整格是墙，缩平后不再挡球", () => {
  const ref = raisedCell();
  const span = 1;
  assert.ok(blueprintExtend(0, span) < BLUEPRINT_HIT_EXTEND);
  assert.ok(Math.abs(blueprintExtend(span / 2, span) - 1) < 1e-6);
  assert.ok(blueprintExtend(span, span) < 1e-6);
  const flat = blueprintBlocks(world, clock({ cells: [ref], cycle: 0, duration: span }))[0]!;
  const raised = blueprintBlocks(world, clock({ cells: [ref], cycle: span / 2, duration: span }))[0]!;
  assert.equal(flat.dynamic, true);
  assert.equal(raised.dynamic, true);
  assert.deepEqual(flat.cell, raised.cell);
  assert.equal(flat.solid, null);
  assert.ok(flat.extend < BLUEPRINT_HIT_EXTEND);
  assert.deepEqual(raised.solid, raised.cell);
  assert.ok(raised.extend > 0.95);
});

test("球会被方块弹开，缩回后让路，也可以从上方跳过", () => {
  const ref = raisedCell();
  const full = clock({ cells: [ref], cycle: 0.5, duration: 1 });
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
  const hidden = clock({ cells: [ref], cycle: 0, duration: 1 });
  restoreBlueprintClock(hidden);
  assert.ok(blueprintExtend(0, 1) < 0.12);
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), false);
  restoreBlueprintClock(full);
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), true);
});

test("球落在凸出格子上会弹开，不会黏住，跳起来也不会被底边折返", () => {
  const g = world.h * 3.1;
  const dt = 1 / 60;
  const ref = raisedCell();
  const full = clock({ cells: [ref], cycle: 0.5, duration: 1 });
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
  const batch = rollBlueprintBatch(world, { seed: 1, serial: 0, goals: 0, ball: null, hoop: null });
  for (const block of blueprintBlocks(world, clock({ cells: batch.cells, cycle: 0.5, duration: 1 }))) {
    const col = Math.round((block.cell.x - grid.ox) / grid.size);
    const row = Math.round((block.cell.y - grid.oy) / grid.size);
    assert.ok(Math.abs(block.cell.x - (grid.ox + col * grid.size)) < 1e-6);
    assert.ok(Math.abs(block.cell.y - (grid.oy + row * grid.size)) < 1e-6);
    assert.equal(block.cell.w, grid.size);
  }
});

test("完全凸出时填色比以前暗，仍比没凸起亮", () => {
  assert.equal(blueprintFillAlpha(1), BLUEPRINT_MAX_LIGHTNESS);
  assert.ok(BLUEPRINT_MAX_LIGHTNESS < 0.27);
  assert.ok(BLUEPRINT_MAX_LIGHTNESS > 0.08);
  assert.ok(blueprintFillAlpha(1) > blueprintFillAlpha(0.3));
});

test("凸出填色贴住网格线", () => {
  const batch = rollBlueprintBatch(world, { seed: 8, serial: 1, goals: 0, ball: null, hoop: null });
  for (const block of blueprintBlocks(world, clock({ cells: batch.cells, cycle: 0.5, duration: 1 }))) {
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
