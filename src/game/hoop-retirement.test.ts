import test from "node:test";
import assert from "node:assert/strict";
import type { Hoop } from "./types";
import { beginHoopRetirement, stepHoopRetirement, hoopRetirementDone, HOOP_HOLD } from "./hoop-retirement.ts";

const stand = (side: -1 | 1 = 1) => ({
  side, x: side < 0 ? 80 : 320, targetX: side < 0 ? 80 : 320, hold: 0,
  couple: true,
}) as Hoop;

test("ordinary retirement holds, slides, then leaves both edges", () => {
  for (const side of [-1, 1] as const) {
    const h = stand(side);
    beginHoopRetirement(h);
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
