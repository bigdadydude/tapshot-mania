import assert from "node:assert/strict";
import test from "node:test";
import { getTrainSmoke, resetTrainSmoke, restoreTrainSmoke, smokeOpacity, smokeExhaust, stepTrainSmoke } from "./train-smoke.ts";
const world = { w: 390, h: 844, floorY: 720 };
test("parked train emits nothing; moving train emits both colors and drifts backward", () => {
  resetTrainSmoke(); stepTrainSmoke(2, 0, world, []);
  assert.equal(getTrainSmoke().puffs.length, 0);
  const p = [];
  for (let i = 0; i < 420; i++) { stepTrainSmoke(1 / 60, 540, world, [], { phase: "accel", phaseT: i / 60, stationIndex: 0 }); p.push(...getTrainSmoke().puffs); }
  assert.ok(p.some(p => p.black)); assert.ok(p.some(p => !p.black));
  assert.ok(p.some(p => p.x < 0.5 && p.y < world.floorY / world.h - 0.1));
  for (let i = 0; i < 300; i++) stepTrainSmoke(1 / 60, 0, world, []);
  assert.equal(getTrainSmoke().puffs.length, 0);
});
test("only black smoke stains objects and the stain expires without affecting physics", () => {
  const b = { x: 195, y: 422, r: 15, sootLeft: 0 };
  const puff = { x: 0.5, y: 0.5, age: 1, black: false, seed: 0 };
  restoreTrainSmoke({ clock: 0, emission: 0, puffs: [puff] });
  stepTrainSmoke(0, 0, world, [b]); assert.equal(b.sootLeft, 0);
  restoreTrainSmoke({ clock: 0, emission: 0, puffs: [{ ...puff, black: true }] });
  stepTrainSmoke(0, 0, world, [b]); assert.equal(b.sootLeft, 2);
  assert.equal(b.x, 195); assert.equal(b.y, 422);
  resetTrainSmoke(); stepTrainSmoke(2.1, 0, world, [b]); assert.equal(b.sootLeft, 0);
  assert.ok(smokeOpacity({ ...puff, black: true }) > 0.9);
  assert.ok(smokeOpacity(puff) < 0.1);
});
test("rewind snapshots are isolated and restore smoke exactly", () => {
  resetTrainSmoke(); stepTrainSmoke(0.5, 540, world, []);
  const saved = getTrainSmoke(), expected = structuredClone(saved);
  stepTrainSmoke(1, 540, world, []); assert.deepEqual(saved, expected);
  restoreTrainSmoke(saved); stepTrainSmoke(0.1, 0, world, []);
  assert.deepEqual(saved, expected);
  restoreTrainSmoke(saved); assert.deepEqual(getTrainSmoke(), expected);
  resetTrainSmoke(); assert.equal(getTrainSmoke().puffs.length, 0);
});

test("cruise has long clear intervals; exhaust shades are continuous and deceleration dies away", () => {
  let clear = 0, smoky = 0, previous = 0, intermediate = 0;
  for (let i = 0; i < 6000; i++) {
    const e = smokeExhaust({phase: "cruise", phaseT: i / 100, stationIndex: 0}, 540);
    if (e.strength === 0) clear++; else smoky++;
    assert.ok(Math.abs(e.shade - previous) < 0.025); previous = e.shade;
    if (e.shade > 0.2 && e.shade < 0.65) intermediate++;
  }
  assert.ok(clear > smoky * 3); assert.ok(intermediate > 0);
  assert.equal(smokeExhaust({phase: "decel", phaseT: 3, stationIndex: 0}, 300).strength, 0);
  assert.equal(smokeExhaust({phase: "parked", phaseT: 1, stationIndex: 0}, 0).strength, 0);
});
test("slow exhaust rises nearly vertically; faster air bends existing smoke backward", () => {
  const saved = {clock:0,emission:0,puffs:[{x:0.8,y:0.7,age:1,black:false,seed:0}]};
  restoreTrainSmoke(saved); stepTrainSmoke(0.2, 10, world, [], {phase:"parked",phaseT:0,stationIndex:0});
  const slow = getTrainSmoke().puffs[0];
  restoreTrainSmoke(saved); stepTrainSmoke(0.2, 540, world, [], {phase:"parked",phaseT:0,stationIndex:0});
  const fast = getTrainSmoke().puffs[0];
  assert.ok((0.8-slow.x)*world.w < (0.7-slow.y)*world.h * 0.3);
  assert.ok((0.8-fast.x)*world.w > (0.7-fast.y)*world.h * 3);
});
