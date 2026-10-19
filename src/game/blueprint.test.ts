import assert from "node:assert/strict";
import test from "node:test";
import { getScene, SCENE_LABELS, setScene } from "./scenes.ts";
import {
  BLUEPRINT_EXTEND_PERIOD,
  BLUEPRINT_FLOOR_SPREAD,
  BLUEPRINT_MAX_COUNT,
  BLUEPRINT_RAMP_PACE,
  BLUEPRINT_START_COUNT,
  blueprintBlocks,
  blueprintExtend,
  blueprintFloorDepthX,
  blueprintFloorRowY,
  blueprintGrid,
  blueprintJumpClearY,
  blueprintQuota,
  blueprintVanishingPoint,
  collideBlueprint,
  restoreBlueprintClock,
  type BlueprintBlock,
} from "./blueprint.ts";

function makeWorld(w = 390, h = 844) {
  const ballR = Math.max(17, Math.min(w, h) * 0.05);
  return { w, h, floorY: h * 0.765, ballR, hoopInner: Math.max(22, ballR * 1.42) };
}

const world = makeWorld();
const clock = (elapsed: number, cycle = 0, seed = 1) => ({ seed, elapsed, cycle });

function at(elapsed: number, cycle = 0, seed = 1) {
  return blueprintBlocks(world, clock(elapsed, cycle, seed));
}

function center(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

test("开局有方块，进程中变多，并停在上限", () => {
  const start = at(0);
  const next = at(BLUEPRINT_RAMP_PACE);
  const later = at(BLUEPRINT_RAMP_PACE * 3);
  const cap = at(10_000);
  assert.equal(start.length, Math.min(BLUEPRINT_START_COUNT, cap.length));
  assert.ok(start.length >= 3, `reference court only placed ${start.length}`);
  assert.equal(next.length, start.length + 1);
  assert.ok(later.length > next.length);
  assert.equal(cap.length, Math.min(BLUEPRINT_MAX_COUNT, cap.length));
  assert.ok(cap.length <= BLUEPRINT_MAX_COUNT);
  assert.equal(blueprintQuota(0, 99), BLUEPRINT_START_COUNT);
  assert.equal(blueprintQuota(BLUEPRINT_RAMP_PACE * 100, 4), 4);
});

test("已出现的格子不换位，动态方块随进程变多", () => {
  const early = at(0);
  const late = at(BLUEPRINT_RAMP_PACE * 4);
  for (const block of early) {
    const same = late.find((item) => item.id === block.id);
    assert.ok(same);
    assert.equal(same!.col, block.col);
    assert.equal(same!.row, block.row);
    assert.equal(same!.dynamic, block.dynamic);
  }
  const dynamic = (blocks: BlueprintBlock[]) => blocks.filter((block) => block.dynamic).length;
  assert.equal(dynamic(early), 1);
  assert.ok(dynamic(late) > dynamic(early));
});

function cycleNear(index: number, want: number) {
  let best = 0;
  let err = Infinity;
  for (let i = 0; i <= 90; i++) {
    const cycle = (i / 90) * BLUEPRINT_EXTEND_PERIOD;
    const delta = Math.abs(blueprintExtend(true, cycle, index) - want);
    if (delta < err) {
      err = delta;
      best = cycle;
    }
  }
  return best;
}

test("动态方块只绕格子中心伸缩", () => {
  assert.equal(blueprintExtend(false, 1.2, 4), 1);
  assert.ok(blueprintExtend(true, 0, 0) < 1e-6);
  assert.ok(Math.abs(blueprintExtend(true, BLUEPRINT_EXTEND_PERIOD / 2, 0) - 1) < 1e-6);
  assert.ok(blueprintExtend(true, BLUEPRINT_EXTEND_PERIOD, 0) < 1e-6);
  const sample = at(0, 0).find((item) => item.dynamic)!;
  const shut = at(0, cycleNear(sample.index, 0.2)).find((item) => item.id === sample.id)!;
  const open = at(0, cycleNear(sample.index, 1)).find((item) => item.id === sample.id)!;
  assert.deepEqual(center(shut.cell), center(open.cell));
  assert.ok(shut.solid && open.solid);
  assert.deepEqual(center(shut.solid!), center(open.solid!));
  assert.ok(open.solid!.w > shut.solid!.w + 4);
  assert.ok(open.extend > 0.95);
  assert.ok(shut.extend < 0.28);
});

test("方块让开篮筐、地面和起跳高度", () => {
  const blocks = at(10_000);
  const clear = blueprintJumpClearY(world);
  assert.ok(blocks.some((block) => block.cell.y > clear));
  for (const block of blocks) {
    assert.ok(block.cell.y >= world.h * 0.2);
    assert.ok(block.cell.y + block.cell.h <= world.floorY - world.ballR * 2.35 + 0.02);
    const left = world.hoopInner + world.w * 0.1;
    const right = world.w - world.hoopInner - world.w * 0.1;
    const reach = world.hoopInner + world.ballR * 1.35;
    const overlaps = (x: number) => block.cell.x < x + reach && block.cell.x + block.cell.w > x - reach;
    assert.equal(overlaps(left), false);
    assert.equal(overlaps(right), false);
  }
  for (const sample of [makeWorld(320, 700), makeWorld(500, 780), makeWorld(280, 620)]) {
    const placed = blueprintBlocks(sample, clock(10_000, 0, 3));
    for (const block of placed) {
      assert.ok(block.cell.y + block.cell.h < sample.floorY - sample.ballR);
    }
  }
});

test("球会被方块弹开，缩回后让路，也可以从上方跳过", () => {
  restoreBlueprintClock(clock(0, BLUEPRINT_EXTEND_PERIOD / 2, 1));
  const target = at(0, BLUEPRINT_EXTEND_PERIOD / 2).find((block) => block.solid)!;
  const y = target.cell.y + target.cell.h / 2;
  const side = { x: target.cell.x + 6, y, vx: 640, vy: 0, r: 14 };
  assert.equal(collideBlueprint(world, side, target.cell.x - 18, y), true);
  assert.ok(side.vx < 0);
  assert.ok(side.x + side.r <= target.cell.x + 1);

  const top = { x: target.cell.x + target.cell.w / 2, y: target.cell.y + 4, vx: 0, vy: 720, r: 14 };
  assert.equal(collideBlueprint(world, top, top.x, target.cell.y - 16), true);
  assert.ok(top.vy < 0);

  const overR = 12;
  const overY = target.cell.y - overR - 3;
  const over = { x: target.cell.x + target.cell.w - overR - 3, y: overY, vx: 180, vy: 0, r: overR };
  assert.equal(collideBlueprint(world, over, target.cell.x + overR + 3, overY), false);

  const hidden = at(0, 0).find((block) => block.dynamic)!;
  const inside = { x: hidden.cell.x + hidden.cell.w / 2, y: hidden.cell.y + hidden.cell.h / 2, vx: 0, vy: 0, r: 12 };
  restoreBlueprintClock(clock(0, cycleNear(hidden.index, 0), 1));
  assert.ok(blueprintExtend(true, cycleNear(hidden.index, 0), hidden.index) < 0.12);
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), false);
  restoreBlueprintClock(clock(0, cycleNear(hidden.index, 1), 1));
  assert.equal(collideBlueprint(world, { ...inside }, inside.x, inside.y), true);
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
  for (const block of at(10_000)) {
    const col = Math.round((block.cell.x - grid.ox) / grid.size);
    const row = Math.round((block.cell.y - grid.oy) / grid.size);
    assert.ok(Math.abs(block.cell.x - (grid.ox + col * grid.size)) < 1e-6);
    assert.ok(Math.abs(block.cell.y - (grid.oy + row * grid.size)) < 1e-6);
    assert.equal(block.cell.w, grid.size);
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
