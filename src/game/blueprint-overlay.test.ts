import assert from "node:assert/strict";
import test from "node:test";
import {
  BLUEPRINT_RAISE, BLUEPRINT_CROSS_RAISE, blueprintBlocks, blueprintVisibleBlocks,
  drawBlueprintCodeBlocks, blueprintCellPixels,
  blueprintLayerPriority, blueprintTopLayer, getBlueprintClock, restoreBlueprintClock,
  resetBlueprint, stepBlueprint, touchBlueprintCell, collideBlueprint, applyBlueprintTurnRed,
  blueprintCellLocked, drainBlueprintRewardEvents, consumeBlueprintLitForHole,
  type BlueprintCellRef, type BlueprintDynamic, type BlueprintClock,
} from "./blueprint.ts";

const world = { w: 390, h: 844, floorY: 844 * 0.765, ballR: 19.5, hoopInner: 27.69 };
const aim = { goals: 9, ballX: -400, ballY: -400, hoopX: 195, hoopY: 200 };
const at = (col: number, row: number, kind: BlueprintCellRef["kind"] = "white", lit = false): BlueprintCellRef => ({ col, row, kind, ...(lit ? { lit } : {}) });
const key = (cell: BlueprintCellRef) => `${cell.col}:${cell.row}`;
function dyn(cells: BlueprintCellRef[], partial: Partial<BlueprintDynamic> = {}): BlueprintDynamic {
  return { cells, pending: [], dir: 1, phase: "hold", age: 0, stepSpan: 10, raise: BLUEPRINT_CROSS_RAISE, ...partial };
}
function load(cells: BlueprintCellRef[], dynamic: BlueprintDynamic | null = null, extra: Partial<BlueprintClock> = {}) {
  resetBlueprint(7);
  const start = getBlueprintClock();
  restoreBlueprintClock({ ...start, goals: 9, staticCells: cells, cells, staticAge: BLUEPRINT_RAISE, dynamic, ...extra });
  stepBlueprint(0, false, aim, world); // establish real movement view without activating overlays
}
function tick(dt = 0) { stepBlueprint(dt, true, aim, world); }
function hit(col = 4, row = 8) {
  const b = blueprintVisibleBlocks(world).find((b) => b.col === col && b.row === row)!;
  assert.ok(b?.solid);
  const ball = { x: b.cell.x + 6, y: b.cell.y + 14, vx: 500, vy: 0, r: 5 };
  assert.equal(collideBlueprint(world, ball, b.cell.x - 7, ball.y), true);
}
function events() { return drainBlueprintRewardEvents(); }
function live() { const c = getBlueprintClock(); return [...c.staticCells, ...(c.dynamic?.cells ?? [])]; }

// These choices are consumed by drawBlueprintBlocks and touchBlueprintCell, not a parallel test-only ranking.
test("四档显示与真实碰撞能力一致，遮挡不删除底层", () => {
  const ranked = [
    { kind: "white" as const, dynamic: false }, { kind: "white" as const, dynamic: true },
    { kind: "red" as const, dynamic: false }, { kind: "black" as const, dynamic: true },
  ];
  assert.deepEqual(ranked.map(blueprintLayerPriority), [0, 1, 2, 3]);
  assert.equal(blueprintTopLayer(ranked), ranked[3]);
  for (const [s, d, moving] of [
    ["red", "black", true], ["black", "white", false], ["white", "white", true],
  ] as const) {
    load([at(4, 8, s), at(5, 8)], dyn([at(4, 8, d)]));
    const shown = blueprintVisibleBlocks(world).find((b) => key(b) === "4:8")!;
    assert.equal(shown.dynamic, moving);
    assert.equal(shown.kind, moving ? d : s);
    hit();
    assert.equal(live().length, 3, "blocked or incomplete line retains both layers");
    assert.equal(getBlueprintClock().staticCells[0]!.lit ?? false, false);
    assert.equal(getBlueprintClock().dynamic!.cells[0]!.lit ?? false, s === "white");
    assert.deepEqual(events(), []);
  }
  load([at(4, 8, "red"), at(5, 8)], dyn([at(4, 8)]));
  assert.equal(blueprintVisibleBlocks(world).find((b) => key(b) === "4:8")!.dynamic, false);
  hit(); // static red is effective even under moving white
  assert.equal(live().length, 0);
  load([at(4, 8), at(5, 8)]);
  hit();
  assert.equal(getBlueprintClock().staticCells[0]!.lit, true);
});

test("移动彩进入固定亮white、移动亮white进入固定彩：两方向红叠亮有暗邻仍爆", () => {
  for (const movingRed of [true, false]) {
    const target = at(5, 8, movingRed ? "white" : "red", movingRed);
    const moving = at(4, 8, movingRed ? "red" : "white", !movingRed);
    load([target, at(6, 8)], dyn([moving], { phase: "cross_out", pending: [at(5, 8)], raise: 0.2 }));
    tick(0.1);
    assert.equal(getBlueprintClock().pendingBonus, 0, "pending is not a live overlap");
    assert.equal(getBlueprintClock().staticCells.length, 2);
    tick(0.1);
    assert.equal(live().length, 0);
    assert.equal(getBlueprintClock().pendingBonus, 2);
    tick(0.1); tick(0.1);
    assert.equal(getBlueprintClock().pendingBonus, 2);
  }
});

test("同一层自己的亮不是叠亮，固定亮不被动态误搬，cross_out期间的新亮随本层走", () => {
  load([at(4, 8, "white", true), at(4, 9), at(5, 9)], dyn([at(4, 8)], {
    phase: "cross_out", pending: [at(5, 8)], raise: 0.2,
  }));
  tick(0.2);
  const moved = getBlueprintClock();
  assert.equal(moved.staticCells.find((c) => key(c) === "4:8")!.lit, true);
  assert.equal(moved.dynamic!.cells[0]!.lit ?? false, false);
  assert.ok(!moved.lit.includes("5:8"));
  load([at(5, 8), at(5, 9)], dyn([at(4, 8)], { phase: "cross_out", pending: [at(5, 8)], raise: 0.2 }));
  // Hit old position while retracting: the layer still owns the light on commit.
  // A dark adjacent static prevents ordinary singleton clearing at the old position.
  const before = getBlueprintClock();
  before.staticCells.push(at(4, 9));
  restoreBlueprintClock(before);
  hit();
  tick(0.2);
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.lit, true);
  assert.equal(getBlueprintClock().staticCells.find((c) => key(c) === "5:8")!.lit ?? false, false);
  load([at(4, 8), at(5, 8)], dyn([at(4, 8, "green", true)]));
  tick();
  assert.deepEqual(events(), [], "own lit does not arm green overlap");
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.overlapGreen, undefined);
});

test("黑覆盖亮层仍不点亮、不激活，黑锁保持；红叠亮十字遇实际黑停且不递归", () => {
  load([at(4, 8, "white", true), at(5, 8)], dyn([at(4, 8, "black")]));
  tick(); hit();
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.lit, undefined);
  assert.equal(live().length, 3);
  assert.equal(blueprintCellLocked(5, 8), true);
  assert.deepEqual(events(), []);
  load([at(4, 8, "white", true), at(5, 8, "red"), at(5, 9), at(6, 8, "black"), at(7, 8)], dyn([at(4, 8, "red")]));
  tick();
  assert.deepEqual(live().map(key).sort(), ["5:9", "6:8", "7:8"]);
  assert.equal(getBlueprintClock().pendingBonus, 2, "collateral red did not detonate vertically");
  // Actual black shares source: remove nonblack layers only, black remains and blocks extension.
  load([at(4, 8, "black"), at(5, 8)], dyn([at(4, 8, "red")]));
  hit();
  assert.deepEqual(live().map((c) => [key(c), c.kind]), [["4:8", "black"], ["5:8", "white"]]);
});

test("绿叠亮：孤立即激活；只有横或竖全亮不激活；后续邻格点亮达双轴才领奖", () => {
  for (const movingGreen of [true, false]) {
    load([at(4, 8, movingGreen ? "white" : "green", movingGreen)], dyn([at(4, 8, movingGreen ? "green" : "white", !movingGreen)]));
    tick();
    assert.equal(live().length, 0);
    assert.equal(events().length, 1);
    tick(); tick();
    assert.deepEqual(events(), []);
  }
  for (const horizontalBright of [true, false]) {
    load([at(5, 8, "white", true), at(4, 8, "white", horizontalBright), at(6, 8, "white", horizontalBright),
      at(5, 7, "white", !horizontalBright), at(5, 9, "white", !horizontalBright)], dyn([at(5, 8, "green")]));
    tick();
    assert.deepEqual(events(), []);
    assert.equal(getBlueprintClock().dynamic!.cells[0]!.overlapGreen, true);
    // Touch the already-lit axis: normal OR segment clearing must not award the pending green.
    hit(horizontalBright ? 4 : 5, horizontalBright ? 8 : 7);
    assert.deepEqual(events(), []);
    assert.ok(live().some((c) => c.kind === "green"));
    const dark = horizontalBright ? [[5, 7], [5, 9]] : [[4, 8], [6, 8]];
    hit(dark[0]![0], dark[0]![1]);
    assert.deepEqual(events(), []);
    hit(dark[1]![0], dark[1]![1]);
    assert.equal(events().length, 1);
    tick(); tick();
    assert.deepEqual(events(), []);
  }
});

test("叠住后再碰亮会重检，但直接踩绿没有其它层亮时保留原OR规则", () => {
  load([at(4, 8), at(5, 8)], dyn([at(4, 8, "green")]));
  hit();
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.overlapGreen, undefined);
  hit(5, 8);
  assert.equal(events().length, 1);
  // Existing white/green overlap becomes bright through the ordinary touch path, then neighbor recheck.
  load([at(4, 8, "white", true), at(5, 8)], dyn([at(4, 8, "green")]));
  hit();
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.overlapGreen, true);
  assert.deepEqual(events(), []);
  hit(5, 8);
  assert.equal(events().length, 1);
});

test("绿叠亮不越黑锁或暗连续邻格，间隔与对角不算邻居", () => {
  load([at(4, 8, "white", true), at(6, 8, "black")], dyn([at(4, 8, "green")]));
  tick();
  assert.deepEqual(events(), []);
  assert.equal(live().length, 3, "remote row black retains lock even across a gap");
  load([at(4, 8, "white", true), at(5, 9), at(6, 8)], dyn([at(4, 8, "green")]));
  tick();
  assert.equal(events().length, 1, "diagonal and gapped cell do not prevent isolated activation");
});

test("转红保留所属亮态但不立即叠爆，去重/待激活亮态随回溯恢复，黑洞清所有层", () => {
  load([at(4, 8, "white", true), at(5, 8)], dyn([at(4, 8, "green")]));
  applyBlueprintTurnRed(3, 8);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.ok(live().some((c) => c.kind === "red" && c.lit && c.overlapSuppressed));
  tick();
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.deepEqual(events(), []);
  // Pending green state survives rewind; only replaying an actual new future touch can earn again.
  load([at(4, 8, "white", true), at(5, 8)], dyn([at(4, 8, "green")]));
  tick();
  const pending = getBlueprintClock();
  hit(5, 8);
  assert.equal(events().length, 1);
  const rewarded = getBlueprintClock();
  restoreBlueprintClock(rewarded); tick();
  assert.deepEqual(events(), []);
  assert.equal(getBlueprintClock().rewardSerial, rewarded.rewardSerial);
  restoreBlueprintClock(pending); tick();
  assert.deepEqual(events(), []);
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.overlapGreen, true);
  assert.equal(getBlueprintClock().staticCells[0]!.lit, true);
  hit(5, 8);
  assert.equal(events().length, 1);
  load([at(4, 8, "black")], dyn([at(4, 8, "white", true)]));
  const saved = getBlueprintClock();
  assert.equal(consumeBlueprintLitForHole(), 1);
  assert.equal(live().length, 0);
  restoreBlueprintClock(saved);
  assert.equal(getBlueprintClock().dynamic!.cells[0]!.lit, true);
  assert.equal(getBlueprintClock().staticCells[0]!.lit, undefined);
});

test("真实dynamic=null新生后实际移动到固定亮块触发，不提前处理pending目的地", (t) => {
  let found = false;
  for (let seed = 1; seed <= 100 && !found; seed++) {
    resetBlueprint(seed);
    stepBlueprint(0, true, { ...aim, goals: 30 }, world);
    if (!getBlueprintClock().dynamic) continue;
    stepBlueprint(BLUEPRINT_RAISE, true, { ...aim, goals: 30 }, world);
    const raised = getBlueprintClock();
    stepBlueprint(raised.dynamic!.stepSpan + 0.01, true, { ...aim, goals: 30 }, world);
    const moving = getBlueprintClock();
    if (moving.dynamic?.phase !== "cross_out") continue;
    const index = moving.dynamic.cells.findIndex((c) => c.kind === "red");
    if (index < 0) continue;
    const dest = moving.dynamic.pending[index]!;
    if (moving.dynamic.cells.some((c) => key(c) === key(dest))) continue;
    // Keep the actual newborn group/geometry/motion; prepare a single controlled white target at its pending destination.
    restoreBlueprintClock({ ...moving, staticCells: [at(dest.col, dest.row, "white", true)], clearing: [], pendingBonus: 0 });
    stepBlueprint(0, true, { ...aim, goals: 30 }, world);
    assert.equal(getBlueprintClock().pendingBonus, 0);
    assert.ok(getBlueprintClock().dynamic!.cells.some((c) => c.kind === "red" && key(c) === key(moving.dynamic!.cells[index]!)));
    stepBlueprint(moving.dynamic.raise, true, { ...aim, goals: 30 }, world);
    assert.ok(getBlueprintClock().pendingBonus > 0);
    assert.ok(!(getBlueprintClock().dynamic?.cells ?? []).some((c) => c.kind === "red" && key(c) === key(dest)));
    t.diagnostic(JSON.stringify({ actual: 30, newbornSeed: seed, from: key(moving.dynamic.cells[index]!), to: key(dest) }));
    found = true;
  }
  assert.equal(found, true);
});


test("实际绘制入口按四档选色，只画一层且不因画图删底层", () => {
  for (const [s, d, expected] of [
    [at(4, 8, "red", true), at(4, 8, "green"), "rgba(76, 230, 133,"],
    [at(4, 8, "red"), at(4, 8, "white", true), "rgba(217, 0, 27,"],
    [at(4, 8, "white", true), at(4, 8), "rgba(236, 244, 255,"],
    [at(4, 8, "white", true), null, "rgba(255, 255, 255,"],
  ] as const) {
    load([s], d ? dyn([d]) : null);
    const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
    const ctx = {
      fillStyle: "" as string | CanvasGradient, strokeStyle: "", lineWidth: 1, globalAlpha: 1,
      save() {}, restore() {}, strokeRect() {},
      createLinearGradient() { return { addColorStop() {} } as unknown as CanvasGradient; },
      fillRect(x: number, y: number, w: number, h: number) { fills.push({ style: String(this.fillStyle), x, y, w, h }); },
    };
    const block = blueprintVisibleBlocks(world)[0]!;
    const rect = blueprintCellPixels(block.cell).fill;
    drawBlueprintCodeBlocks(ctx as unknown as CanvasRenderingContext2D, world);
    const front = fills.filter(({ x, y, w, h }) => x === rect.x && y === rect.y && w === rect.w && h === rect.h);
    assert.equal(front.length, 1);
    assert.ok(front[0]!.style.startsWith(expected), front[0]!.style);
    assert.equal(live().length, d ? 2 : 1);
  }
});

test("消除动画不是叠亮来源，也不遮挡新到同格的live层能力", () => {
  load([at(4, 8, "red")]);
  hit();
  const clearing = getBlueprintClock();
  assert.equal(clearing.clearing.length, 1);
  // A newly arriving layer is distinct from the old clearing layer at the same coordinate.
  restoreBlueprintClock({ ...clearing, dynamic: dyn([at(4, 8, "green")]) });
  tick();
  assert.deepEqual(events(), [], "old animation cannot light a new green");
  const visible = blueprintVisibleBlocks(world).find((b) => key(b) === "4:8")!;
  assert.equal(visible.kind, "green");
  assert.equal(visible.dynamic, true);
  hit();
  assert.equal(events().length, 1, "new live layer is not suppressed by old coordinate animation");
  tick(); tick();
  assert.deepEqual(events(), []);
});


test("旧坐标快照：移动黑覆盖固定white时，亮迁移给底层固定white", () => {
  load([at(5, 9)], dyn([at(5, 9, "black")]), { layerStateVersion: undefined, lit: ["5:9"] });
  const restored = getBlueprintClock();
  assert.deepEqual(restored.lit, ["5:9"]);
  assert.equal(restored.staticCells[0]!.lit, true);
  assert.equal(restored.dynamic!.cells[0]!.lit, undefined);
  assert.deepEqual(events(), []);
});

test("旧坐标快照：固定黑覆盖移动white时，亮迁移给底层移动white", () => {
  load([at(5, 9, "black")], dyn([at(5, 9)]), { layerStateVersion: undefined, lit: ["5:9"] });
  const restored = getBlueprintClock();
  assert.deepEqual(restored.lit, ["5:9"]);
  assert.equal(restored.dynamic!.cells[0]!.lit, true);
  assert.equal(restored.staticCells[0]!.lit, undefined);
  assert.deepEqual(events(), []);
});

test("旧坐标快照：全黑叠层无可迁移层，不点亮黑", () => {
  load([at(5, 9, "black")], dyn([at(5, 9, "black")]), { layerStateVersion: undefined, lit: ["5:9"] });
  const restored = getBlueprintClock();
  assert.deepEqual(restored.lit, []);
  assert.equal(restored.staticCells[0]!.lit, undefined);
  assert.equal(restored.dynamic!.cells[0]!.lit, undefined);
  assert.deepEqual(events(), []);
});

test("旧坐标快照：非黑候选仍按原四档优先级，只迁移给一层", () => {
  for (const [fixedKind, movingKind, expectedMoving] of [
    ["white", "white", true], ["green", "white", false], ["green", "red", true],
  ] as const) {
    load([at(5, 9, fixedKind)], dyn([at(5, 9, movingKind)]), { layerStateVersion: undefined, lit: ["5:9"] });
    const restored = getBlueprintClock();
    assert.equal(restored.staticCells[0]!.lit ?? false, !expectedMoving);
    assert.equal(restored.dynamic!.cells[0]!.lit ?? false, expectedMoving);
    assert.equal(live().filter((cell) => cell.lit).length, 1);
    assert.deepEqual(events(), []);
  }
});

test("现代逐层快照不走旧坐标迁移，不补亮底层或改写触发标记", () => {
  for (const movingBlack of [true, false]) {
    const white = { ...at(5, 9, "white", true), overlapSuppressed: true };
    load([movingBlack ? white : at(5, 9, "black")], dyn([movingBlack ? at(5, 9, "black") : white]));
    const saved = getBlueprintClock();
    restoreBlueprintClock(saved);
    assert.deepEqual(getBlueprintClock(), saved);
    assert.deepEqual(events(), []);
  }
  load([at(5, 9)], dyn([at(5, 9, "black")]), { layerStateVersion: 1, lit: ["5:9"] });
  assert.deepEqual(getBlueprintClock().lit, [], "modern coordinate projection is not ownership truth");
  assert.equal(getBlueprintClock().staticCells[0]!.lit, undefined);
});
