import assert from "node:assert/strict";
import test from "node:test";
import {
  BLUEPRINT_RAISE, BLUEPRINT_CROSS_RAISE, blueprintDynamicGroups, blueprintDynamicGroupBudgets,
  blueprintBlocks, blueprintVisibleBlocks, blueprintCountSoftMax, blueprintDespawnChance,
  rollBlueprintBatch, getBlueprintClock, restoreBlueprintClock, resetBlueprint,
  stepBlueprint, collideBlueprint, touchBlueprintCell, applyBlueprintTurnRed,
  blueprintCellLocked, consumeBlueprintLitForHole, drainBlueprintRewardEvents,
  type BlueprintCellRef, type BlueprintDynamic, type BlueprintClock,
} from "./blueprint.ts";
const world = { w: 390, h: 844, floorY: 844 * 0.765, ballR: 19.5, hoopInner: 27.69 };
const aim = { goals: 30, ballX: -400, ballY: -400, hoopX: 195, hoopY: 200 };
const key = (cell: BlueprintCellRef) => `${cell.col}:${cell.row}`;
const cell = (col: number, row: number, kind: BlueprintCellRef["kind"] = "white", layerId?: string, lit = false): BlueprintCellRef => ({ col, row, kind, ...(layerId ? { layerId } : {}), ...(lit ? { lit } : {}) });
function group(groupId: string, cells: BlueprintCellRef[], partial: Partial<BlueprintDynamic> = {}): BlueprintDynamic {
  return { groupId, cells, dir: 0, pending: [], phase: "hold", age: 0, stepSpan: 10, raise: 0.2, ...partial };
}
function batch(groups: BlueprintDynamic[]): BlueprintDynamic | null {
  return groups.length ? { ...groups[0]!, cells: groups.flatMap((g) => g.cells), pending: groups.flatMap((g) => g.pending), groups } : null;
}
function load(fixed: BlueprintCellRef[], groups: BlueprintDynamic[], extra: Partial<BlueprintClock> = {}) {
  resetBlueprint(1);
  restoreBlueprintClock({ ...getBlueprintClock(), goals: 30, staticCells: fixed, staticAge: BLUEPRINT_RAISE, dynamic: batch(groups), ...extra });
  stepBlueprint(0, false, { ...aim, goals: extra.goals ?? 30 }, world);
}
function tick(dt = 0, goals = 30) { stepBlueprint(dt, true, { ...aim, goals }, world); }
function groups() { return blueprintDynamicGroups(getBlueprintClock().dynamic); }
function live() { const clock = getBlueprintClock(); return [...clock.staticCells, ...blueprintDynamicGroups(clock.dynamic).flatMap((g) => g.cells)]; }
function hit(col: number, row: number) {
  const block = blueprintVisibleBlocks(world).find((b) => b.col === col && b.row === row)!;
  assert.ok(block?.solid);
  const ball = { x: block.cell.x + 6, y: block.cell.y + 14, vx: 500, vy: 0, r: 5 };
  assert.equal(collideBlueprint(world, ball, block.cell.x - 7, ball.y), true);
}
function unit(seed: number, serial: number, channel: number) {
  const n = Math.sin(seed * 12.9898 + (serial + 1) * 78.233 + (channel + 1) * 39.425) * 43758.5453;
  return n - Math.floor(n);
}
function spawn(seed: number, actual = 30) {
  resetBlueprint(seed);
  restoreBlueprintClock({ ...getBlueprintClock(), goals: actual - 1, serial: 5, dynamic: null });
  assert.equal(getBlueprintClock().dynamic, null);
  const target = rollBlueprintBatch(world, { seed, serial: 6, goals: actual, ball: { x: aim.ballX, y: aim.ballY }, hoop: { x: aim.hoopX, y: aim.hoopY } }).target;
  tick(0, actual);
  return { clock: getBlueprintClock(), target };
}

test("小预算不逐格散开，足够预算拆2至3小组，预算合计不膨胀", () => {
  assert.deepEqual(blueprintDynamicGroupBudgets(0), []);
  assert.deepEqual(blueprintDynamicGroupBudgets(1), [1]);
  assert.deepEqual(blueprintDynamicGroupBudgets(2), [2]);
  assert.deepEqual(blueprintDynamicGroupBudgets(3), [3]);
  assert.deepEqual(blueprintDynamicGroupBudgets(4), [2, 2]);
  assert.deepEqual(blueprintDynamicGroupBudgets(9), [3, 3, 3]);
  for (let budget = 1; budget <= 9; budget++) {
    const plan = blueprintDynamicGroupBudgets(budget);
    assert.equal(plan.reduce((a, b) => a + b, 0), budget);
    if (plan.length > 1) assert.ok(plan.every((n) => n >= 2));
  }
});

test("真实dynamic=null换批：整批仅原45%门，多组不增加want或softMax，IDs唯一", (t) => {
  let multi = 0, spawned = 0;
  for (const actual of [3, 6, 9, 15, 30, 100]) {
    for (let seed = 1; seed <= 120; seed++) {
      const { clock, target } = spawn(seed, actual);
      const born = blueprintDynamicGroups(clock.dynamic);
      assert.equal(born.length > 0, target > 1 && unit(seed, 6, 10) < 0.45);
      assert.equal(clock.staticCells.length + born.flatMap((g) => g.cells).length, target);
      assert.ok(target <= blueprintCountSoftMax(actual));
      if (!born.length) continue;
      spawned++;
      assert.deepEqual(born.map((g) => g.cells.length), blueprintDynamicGroupBudgets(target - 1));
      assert.ok(born.every((g) => g.phase === "raise" && g.cells.every((c) => !c.lit)));
      const ids = [...clock.staticCells, ...born.flatMap((g) => g.cells)].map((c) => c.layerId);
      assert.ok(ids.every(Boolean));
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(new Set(born.map((g) => g.groupId)).size, born.length);
      if (born.length >= 2) {
        multi++;
        assert.equal(new Set(born.map((g) => g.dir)).size, born.length);
      }
    }
  }
  assert.ok(multi > 0);
  t.diagnostic(JSON.stringify({ trials: 720, spawned, multi }));
});

test("真实新生同批多方向持续移动可见，组内形状及ID保持，相位各自推进", (t) => {
  let verified = false;
  for (let seed = 1; seed <= 60 && !verified; seed++) {
    const { clock } = spawn(seed);
    if (blueprintDynamicGroups(clock.dynamic).length < 2) continue;
    tick(BLUEPRINT_RAISE);
    const original = groups();
    assert.ok(original.every((g) => g.phase === "hold"));
    const offsets = (g: BlueprintDynamic) => g.cells.map((c) => [c.col - g.cells[0]!.col, c.row - g.cells[0]!.row]);
    const firstDeltas = new Map<string, string>();
    const seenVisible = new Set<string>();
    let independentPhases = false;
    for (let frame = 0; frame < 160; frame++) {
      tick(0.02);
      const moving = groups();
      if (new Set(moving.map((g) => `${g.phase}:${g.age.toFixed(2)}`)).size > 1) independentPhases = true;
      for (const g of moving) {
        const before = original.find((b) => b.groupId === g.groupId)!;
        assert.ok(before);
        assert.deepEqual(g.cells.map((c) => c.layerId), before.cells.map((c) => c.layerId));
        assert.deepEqual(offsets(g), offsets(before));
        const dx = g.cells[0]!.col - before.cells[0]!.col, dy = g.cells[0]!.row - before.cells[0]!.row;
        if ((dx || dy) && !firstDeltas.has(g.groupId!)) firstDeltas.set(g.groupId!, `${dx}:${dy}`);
        if (blueprintVisibleBlocks(world).some((b) => g.cells.some((c) => c.layerId === b.id))) seenVisible.add(g.groupId!);
      }
    }
    if (new Set(firstDeltas.values()).size < 2) continue;
    assert.equal(firstDeltas.size, original.length);
    assert.equal(seenVisible.size, original.length);
    assert.ok(independentPhases);
    const saved = getBlueprintClock();
    restoreBlueprintClock(saved);
    assert.deepEqual(getBlueprintClock(), saved);
    t.diagnostic(JSON.stringify({ seed, groups: original.map((g) => ({ id: g.groupId, size: g.cells.length, dir: g.dir })), firstDeltas: [...firstDeltas] }));
    verified = true;
  }
  assert.equal(verified, true);
});

test("进球消失只掷整批一次：所有旧group IDs一起保留或消失；小样本不强摘动态", (t) => {
  let kept = 0, removed = 0, small = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { clock: before } = spawn(seed);
    const old = blueprintDynamicGroups(before.dynamic);
    if (old.length < 2) continue;
    const oldIds = old.map((g) => g.groupId);
    const oldCount = old.flatMap((g) => g.cells).length;
    const target = rollBlueprintBatch(world, { seed, serial: 7, goals: 31, ball: { x: aim.ballX, y: aim.ballY }, hoop: { x: aim.hoopX, y: aim.hoopY } }).target;
    tick(0, 31);
    const after = getBlueprintClock();
    const next = blueprintDynamicGroups(after.dynamic);
    const survivors = next.filter((g) => oldIds.includes(g.groupId));
    if (unit(seed, 7, 9) < blueprintDespawnChance(31)) {
      removed++;
      assert.equal(survivors.length, 0);
      assert.equal(next.length > 0, target > 1 && unit(seed, 7, 10) < 0.45);
      assert.equal(after.staticCells.length + next.flatMap((g) => g.cells).length, target);
    } else {
      kept++;
      assert.equal(survivors.length, old.length);
      assert.deepEqual(next.map((g) => g.groupId), oldIds);
      assert.equal(after.staticCells.length, Math.max(0, target - oldCount));
      if (target < oldCount) { small++; assert.equal(after.staticCells.length, 0); }
    }
    assert.ok(after.staticCells.length + next.flatMap((g) => g.cells).length <= 10);
  }
  assert.ok(kept > 0 && removed > 0 && small > 0);
  t.diagnostic(JSON.stringify({ kept, removed, small }));
});

test("两组同帧提交为事务：红到亮块时黑也已到路径，不提前激活pending或穿透最终黑", () => {
  for (const reverse of [false, true]) {
    const red = group("group:red", [cell(4, 8, "red", "layer:red")], { phase: "cross_out", pending: [cell(5, 8)], dir: 0 });
    const black = group("group:black", [cell(6, 7, "black", "layer:black")], { phase: "cross_out", pending: [cell(6, 8)], dir: 1 });
    load([cell(5, 8, "white", "layer:bright", true), cell(6, 8), cell(7, 8)], reverse ? [black, red] : [red, black]);
    tick(0.1);
    assert.equal(getBlueprintClock().pendingBonus, 0);
    assert.equal(live().find((c) => c.layerId === "layer:red")!.col, 4);
    tick(0.1);
    assert.ok(live().some((c) => key(c) === "7:8"));
    assert.ok(live().some((c) => key(c) === "6:8" && c.kind === "black"));
    assert.ok(!live().some((c) => c.kind === "red"));
    assert.equal(getBlueprintClock().pendingBonus, 2);
  }
});

test("多组同档ID稳定破平局，真实显示/碰撞只点对应层，不按dynamic布尔误选", () => {
  for (const reverse of [false, true]) {
    const a = group("group:a", [cell(5, 8, "white", "layer:a")]);
    const z = group("group:z", [cell(5, 8, "white", "layer:z")]);
    load([cell(6, 8)], reverse ? [z, a] : [a, z]);
    assert.equal(blueprintVisibleBlocks(world).find((b) => key(b) === "5:8")!.id, "layer:a");
    hit(5, 8);
    assert.equal(live().find((c) => c.layerId === "layer:a")!.lit, true);
    assert.equal(live().find((c) => c.layerId === "layer:z")!.lit, undefined);
  }
  // Black is deliberately listed first; red has the smaller same-tier ID and must be the ability source.
  load([cell(6, 8)], [group("group:black", [cell(5, 8, "black", "layer:z")]), group("group:red", [cell(5, 8, "red", "layer:a")])]);
  assert.equal(blueprintVisibleBlocks(world).find((b) => key(b) === "5:8")!.kind, "red");
  hit(5, 8);
  assert.ok(!live().some((c) => c.kind === "red"));
  assert.ok(live().some((c) => c.kind === "black"));
  assert.ok(live().some((c) => key(c) === "6:8"), "actual source black still blocks red extension");
  load([cell(6, 8)], [group("group:red", [cell(5, 8, "red", "layer:z")]), group("group:black", [cell(5, 8, "black", "layer:a")])]);
  hit(5, 8);
  assert.equal(live().length, 3);
  assert.ok(live().every((c) => !c.lit));
});

test("清层只移除各组非黑层，pending随对应组与层ID重建；转红跨组去重不即时爆", () => {
  load([cell(5, 8, "red"), cell(6, 8)], [
    group("group:a", [cell(5, 8, "white", "layer:hit"), cell(5, 9, "white", "layer:stay")], { phase: "cross_out", pending: [cell(6, 8), cell(6, 9)], dir: 0 }),
    group("group:b", [cell(5, 8, "black", "layer:black")], { phase: "cross_out", pending: [cell(5, 9)], dir: 1 }),
  ]);
  // Moving black wins over fixed red, so use a red in an adjacent clear path to remove nonblack layers at the stack.
  const snap = getBlueprintClock();
  snap.staticCells.push(cell(4, 8, "red"));
  restoreBlueprintClock(snap);
  hit(4, 8);
  const a = groups().find((g) => g.groupId === "group:a")!;
  assert.deepEqual(a.cells.map((c) => c.layerId), ["layer:stay"]);
  assert.deepEqual(a.pending.map((c) => [key(c), c.layerId]), [["6:9", "layer:stay"]]);
  assert.ok(groups().some((g) => g.groupId === "group:b" && g.cells[0]!.layerId === "layer:black"));
  load([cell(5, 8, "white", "layer:fixed", true), cell(6, 8)], [
    group("group:g", [cell(5, 8, "green", "layer:g")]), group("group:b", [cell(5, 8, "black", "layer:b")]),
  ]);
  applyBlueprintTurnRed(4, 8);
  assert.equal(live().filter((c) => key(c) === "5:8").length, 1);
  assert.equal(live().find((c) => key(c) === "5:8")!.layerId, "layer:fixed");
  assert.equal(live().find((c) => key(c) === "5:8")!.kind, "red");
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.equal(blueprintCellLocked(5, 8), false);
  const transformed = getBlueprintClock();
  assert.equal(transformed.staticCells.find((c) => c.layerId === "layer:fixed")!.overlapSuppressed, true);
  restoreBlueprintClock(transformed);
  assert.deepEqual(getBlueprintClock(), transformed);
  tick();
  assert.equal(getBlueprintClock().pendingBonus, 0);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
});

test("多组绿双轴等待/亮态/触发标记与回溯一起保存；黑洞清所有组，同格绿只领奖一次", () => {
  load([cell(5, 8, "white", "layer:white", true), cell(6, 8), cell(5, 9)], [
    group("group:g", [cell(5, 8, "green", "layer:green")]),
    group("group:other", [{ ...cell(7, 10, "red", "layer:suppressed"), overlapSuppressed: true }]),
  ]);
  tick();
  assert.equal(live().find((c) => c.layerId === "layer:green")!.overlapGreen, true);
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  const waiting = getBlueprintClock();
  hit(6, 8); hit(5, 9);
  assert.equal(drainBlueprintRewardEvents().length, 1);
  const rewarded = getBlueprintClock();
  restoreBlueprintClock(rewarded); tick();
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  restoreBlueprintClock(waiting);
  assert.deepEqual(getBlueprintClock(), waiting);
  assert.equal(live().find((c) => c.layerId === "layer:green")!.overlapGreen, true);
  load([cell(5, 8, "black")], [
    group("group:g1", [cell(5, 8, "green", "layer:g1", true)]),
    group("group:g2", [cell(5, 8, "green", "layer:g2")]),
    group("group:w", [cell(6, 9, "white", "layer:w", true)]),
  ]);
  assert.equal(consumeBlueprintLitForHole(), 2);
  assert.equal(drainBlueprintRewardEvents().length, 1);
  assert.equal(getBlueprintClock().dynamic, null);
  assert.equal(live().length, 0);
  const empty = getBlueprintClock();
  restoreBlueprintClock(empty); tick();
  assert.deepEqual(drainBlueprintRewardEvents(), []);
  assert.equal(consumeBlueprintLitForHole(), 0);
});

test("旧single dynamic快照迁移为一组保留运动相位与亮态，恢复后ID不变不重领奖", () => {
  for (const legacyLit of [false, true]) {
    const old = group("", [cell(5, 8, "white", undefined, !legacyLit)], {
      phase: "cross_out", dir: 0, age: 0.1, raise: 0.2, stepSpan: 0.63, pending: [cell(6, 8)],
    });
    load([cell(5, 9), cell(6, 9)], [], { dynamic: old, ...(legacyLit ? { layerStateVersion: undefined, lit: ["5:8"] } : {}) });
    const before = getBlueprintClock();
    assert.equal(groups().length, 1);
    const restored = groups()[0]!;
    assert.ok(restored.groupId && restored.cells[0]!.layerId);
    assert.equal(restored.phase, "cross_out");
    assert.equal(restored.age, 0.1);
    assert.equal(restored.stepSpan, 0.63);
    assert.equal(restored.cells[0]!.lit, true);
    assert.equal(restored.pending[0]!.layerId, restored.cells[0]!.layerId);
    restoreBlueprintClock(before);
    assert.deepEqual(getBlueprintClock(), before);
    tick(0.1);
    const moved = groups()[0]!;
    assert.equal(moved.groupId, restored.groupId);
    assert.equal(moved.cells[0]!.layerId, restored.cells[0]!.layerId);
    assert.equal(key(moved.cells[0]!), "6:8");
    assert.equal(moved.cells[0]!.lit, true);
    assert.deepEqual(drainBlueprintRewardEvents(), []);
  }
});


test("多组黑锁随各自提交位置更新，旧锁一起解除后已亮段立即清除", () => {
  const a = group("group:a", [cell(5, 10, "black", "layer:a")], { phase: "cross_out", pending: [cell(4, 10)], dir: 2 });
  const b = group("group:b", [cell(6, 10, "black", "layer:b")], { phase: "cross_out", pending: [cell(7, 10)], dir: 0 });
  load([cell(5, 8, "white", "layer:5", true), cell(6, 8, "white", "layer:6", true)], [a, b]);
  assert.equal(blueprintCellLocked(5, 8), true);
  assert.equal(blueprintCellLocked(6, 8), true);
  tick(0.1);
  assert.equal(getBlueprintClock().pendingBonus, 0);
  tick(0.1);
  assert.equal(blueprintCellLocked(5, 8), false);
  assert.equal(blueprintCellLocked(6, 8), false);
  assert.equal(blueprintCellLocked(4, 8), true);
  assert.equal(blueprintCellLocked(7, 8), true);
  assert.equal(getBlueprintClock().pendingBonus, 2);
  assert.equal(getBlueprintClock().staticCells.length, 0);
  assert.deepEqual(groups().map((g) => g.cells[0]!.layerId), ["layer:a", "layer:b"]);
});


test("混合旧新快照补ID不覆盖已有组/层ID，计数器与新分配结果可回溯", () => {
  load([cell(4, 8)], [
    group("", [cell(5, 8)]), group("group:3", [cell(6, 8, "white", "layer:1")]),
  ], { identitySerial: undefined });
  const saved = getBlueprintClock();
  assert.ok(groups().some((g) => g.groupId === "group:3"));
  assert.ok(live().some((c) => c.layerId === "layer:1"));
  assert.equal(new Set(live().map((c) => c.layerId)).size, live().length);
  assert.equal(new Set(groups().map((g) => g.groupId)).size, groups().length);
  assert.ok(saved.identitySerial! > 0);
  restoreBlueprintClock(saved);
  assert.deepEqual(getBlueprintClock(), saved);
});
