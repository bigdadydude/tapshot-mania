import test from "node:test";
import assert from "node:assert/strict";
import { releaseSupportRest } from "./support-release.ts";

test("a settled elastic ball hops outward from either stand", () => {
  for (const side of [-1, 1] as const) for (const vy of [-18, -110]) {
    const ball = {vx: 0, vy, r: 10};
    assert.equal(releaseSupportRest(ball, side, 0, -1, true), true);
    assert.ok(ball.vx * side > 100 && ball.vy < -100);
    const outgoing = {...ball};
    assert.equal(releaseSupportRest(ball, side, 0, -1, true), false, "one hop must not accumulate repeated boosts");
    assert.deepEqual(ball, outgoing);
  }
});
test("ordinary balls, moving elastic balls and side/underside contacts are untouched", () => {
  for (const [vx, vy, nx, ny, highBounce] of [
    [0, 0, 0, -1, false], [200, -100, 0, -1, true],
    [0, 0, 1, 0, true], [0, 0, 0, 1, true],
  ] as const) {
    const ball = {vx, vy, r: 10}, before = {...ball};
    assert.equal(releaseSupportRest(ball, -1, nx, ny, highBounce), false);
    assert.deepEqual(ball, before);
  }
});
