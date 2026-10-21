import test from "node:test";
import assert from "node:assert/strict";
import { hasBuzzerChance } from "./buzzer.ts";

const setup = () => ({
  ball: { x: 230, y: 210, vx: 180, vy: 50, r: 18 },
  targets: [{ x: 340, y: 300, inner: 28, boardX: 380, boardTop: 190, movingPad: 0 }],
  shotPending: true, floorY: 700, width: 450, wrapPad: null as number | null,
  gravity: 900, air: 1, buoy: 0, fallBoost: true, straight: false,
});

test("a descending approach qualifies without guaranteeing a clean make", () => {
  assert.equal(hasBuzzerChance(setup()), true);
});
test("no pending shot cannot enter, even directly above the opening", () => {
  const s = setup(); s.shotPending = false; s.ball.x = 340;
  assert.equal(hasBuzzerChance(s), false);
});
test("a low ball travelling away and a settled ball fail immediately", () => {
  const s = setup(); s.ball = { ...s.ball, y: 430, vx: -180, vy: 150 };
  assert.equal(hasBuzzerChance(s), false);
  s.ball = { ...s.ball, x: 340, y: 682, vx: 0, vy: 0 };
  assert.equal(hasBuzzerChance(s), false);
});
test("an upward shot can qualify even before turning down toward the rim", () => {
  const s = setup(); s.ball = { ...s.ball, x: 220, y: 310, vx: 170, vy: -300 };
  assert.equal(hasBuzzerChance(s), true);
});
test("a bank/top-board approach is accepted outside the rim opening", () => {
  const s = setup(); s.ball = { ...s.ball, x: 380, y: 180, vx: 0, vy: 100 };
  assert.equal(hasBuzzerChance(s), true);
});
test("a flight too high to reach the basket within the bounded window is rejected", () => {
  const s = setup(); s.ball = { ...s.ball, x: 340, y: -6000, vx: 0, vy: -100 };
  assert.equal(hasBuzzerChance(s), false);
});
test("forecasting leaves real body and target state untouched", () => {
  const s = setup(), before = structuredClone(s); hasBuzzerChance(s);
  assert.deepEqual(s, before);
});
