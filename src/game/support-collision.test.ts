import test from "node:test";
import assert from "node:assert/strict";
import { sweepSupport, sweepSupportPolygon, supportPolygonOverlap, type SupportSegment } from "./support-collision.ts";
import { rimArmPoints } from "./rim-arm.ts";
const bar = {x0: 0, y0: 0, x1: 100, y1: 0, halfW: 2};
test("a fast ball is stopped on the incoming side of a support", () => {
  for (const sign of [-1, 1]) for (const radius of [5, 10, 20]) {
    const hit = sweepSupport({x: 50, y: sign * 50}, {x: 50, y: -sign * 50}, radius, bar)!;
    assert.ok(hit);
    assert.ok(Math.abs(hit.y - sign * (radius + 2)) < 1e-6);
    assert.equal(hit.ny, sign);
    assert.ok(hit.t > 0 && hit.t < .5);
  }
});
test("diagonal supports and rounded endpoints cannot be tunneled", () => {
  const tilted: SupportSegment = {x0: 0, y0: 0, x1: 100, y1: 100, halfW: 2};
  const hit = sweepSupport({x: 20, y: 80}, {x: 80, y: 20}, 10, tilted)!;
  assert.ok(hit && hit.x < hit.y && hit.nx < 0 && hit.ny > 0);
  const cap = sweepSupport({x: -40, y: 0}, {x: 40, y: 0}, 10, bar)!;
  assert.equal(cap.x, -12); assert.equal(cap.nx, -1);
});
test("a separating or grazing ball is not recaptured by its old path", () => {
  assert.equal(sweepSupport({x: 50, y: -12}, {x: 55, y: -25}, 10, bar), null);
  assert.equal(sweepSupport({x: 50, y: -11}, {x: 55, y: -25}, 10, bar), null);
  assert.equal(sweepSupport({x: -30, y: -13}, {x: 130, y: -13}, 10, bar), null);
  const slide = sweepSupport({x: 40, y: -11}, {x: 60, y: -11}, 10, bar)!;
  assert.equal(slide.x, 60); assert.equal(slide.y, -12);
});
test("an exactly embedded ball receives a bounded unit normal", () => {
  const hit = sweepSupport({x: 50, y: 0}, {x: 50, y: 1}, 10, bar)!;
  assert.ok(Number.isFinite(hit.x + hit.y));
  assert.ok(Math.abs(Math.hypot(hit.nx, hit.ny) - 1) < 1e-8);
  assert.ok(Math.hypot(hit.x - 50, hit.y) <= 12.01);
});

test("the orange connector blocks both directions across its entire drawn span", () => {
  for (const side of [-1, 1] as const) for (const sear of [0, 3]) {
    const h = {x: 200, y: 200, inner: 28, side, sear, burning: false, char: 0};
    const g = {innerEdge: 200 + side * 42, armTop: 196, armH: 10, boardBotY: 206};
    const points = rimArmPoints(h, g);
    for (const fraction of [.02, .5, .98]) for (const radius of [5, 10, 20]) for (const sign of [-1, 1]) {
      const x = points[0]!.x + (points[1]!.x - points[0]!.x) * fraction;
      const from = {x, y: 200 + sign * 80}, to = {x, y: 200 - sign * 80};
      const hit = sweepSupportPolygon(from, to, radius, points)!;
      assert.ok(hit && hit.ny * sign > .9, "the actual connector must stop the ball on its incoming face");
      assert.equal(supportPolygonOverlap({x: hit.x + hit.nx * .01, y: hit.y + hit.ny * .01}, radius, points), null);
    }
  }
});

test("a ball inside the orange connector is moved outside its solid body", () => {
  const points = [{x: 0, y: 0}, {x: 14, y: 0}, {x: 14, y: 8}, {x: 0, y: 10}];
  for (const vertices of [points, [...points].reverse()]) {
    const hit = sweepSupportPolygon({x: 7, y: 4}, {x: 7, y: 4}, 10, vertices)!;
    assert.ok(hit && Math.hypot(hit.nx, hit.ny) > .999);
    assert.equal(supportPolygonOverlap({x: hit.x + hit.nx * .01, y: hit.y + hit.ny * .01}, 10, vertices), null);
    assert.equal(sweepSupportPolygon({x: 7, y: -11}, {x: 7, y: -30}, 10, vertices), null);
  }
});
