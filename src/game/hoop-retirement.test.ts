import test from "node:test";
import assert from "node:assert/strict";
import type { Hoop } from "./types";
import { beginHoopRetirement, stepHoopRetirement, hoopRetirementDone, HOOP_HOLD } from "./hoop-retirement.ts";
import { retireHackerHoop, settleHackerHoops } from "./hacker.ts";

const stand = (side: -1 | 1 = 1) => ({
  side, x: side < 0 ? 80 : 320, targetX: side < 0 ? 80 : 320, hold: 0,
  couple: true, hacker: { state: "pinned", pinned: true, age: 0, scored: false },
}) as Hoop;

test("ordinary and hacker retirement hold, slide smoothly, then leave both edges", () => {
  for (const side of [-1, 1] as const) {
    const normal = stand(side), hacker = stand(side);
    beginHoopRetirement(normal); retireHackerHoop(hacker);
    for (const h of [normal, hacker]) {
      const start = h.x;
      assert.equal(stepHoopRetirement(h, 400, 0.3), 0);
      assert.equal(h.x, start);
      assert.equal(h.couple, true);
      stepHoopRetirement(h, 400, HOOP_HOLD - 0.3);
      assert.equal(h.x, start);
      stepHoopRetirement(h, 400, 0.04);
      assert.ok((h.x - start) * side > 0);
      assert.equal(h.couple, false);
      assert.equal(hoopRetirementDone(h, 400), false);
      stepHoopRetirement(h, 400, 1);
      assert.equal(hoopRetirementDone(h, 400), true);
    }
    assert.equal(normal.x, hacker.x);
  }
});

test("retirement does not restart on another make or blue-pill exit", () => {
  const h = stand();
  retireHackerHoop(h);
  stepHoopRetirement(h, 400, 0.5);
  retireHackerHoop(h);
  settleHackerHoops([h], h, () => { throw Error("retiring stand rerolled"); });
  assert.equal(h.hold, HOOP_HOLD - 0.5);
  stepHoopRetirement(h, 400, 0.3);
  const x = h.x;
  retireHackerHoop(h);
  assert.equal(h.hold, 0);
  stepHoopRetirement(h, 400, 0.1);
  assert.ok(h.x > x);
});

test("a rejected pin gets the full normal hold and stays in the combo count", () => {
  const h = stand();
  h.hacker!.state = "normal"; h.hacker!.pinned = false;
  assert.equal(settleHackerHoops([h], h, () => 0.99), 1);
  assert.equal(h.hold, HOOP_HOLD);
  assert.equal(h.hacker!.state, "retiring");
  assert.equal(h.hacker!.pinned, false);
});

test("a step spanning the hold boundary agrees with smaller animation steps", () => {
  const a = stand(), b = stand();
  beginHoopRetirement(a); beginHoopRetirement(b);
  stepHoopRetirement(a, 400, 0.9);
  for (let i = 0; i < 90; i++) stepHoopRetirement(b, 400, 0.01);
  assert.ok(Math.abs(a.x - b.x) < 1e-9);
});

test("an unretired secondary stand with no hold keeps its existing target", () => {
  const h = stand();
  stepHoopRetirement(h, 400, 0.1);
  assert.equal(h.x, 320);
  assert.equal(h.couple, true);
});
