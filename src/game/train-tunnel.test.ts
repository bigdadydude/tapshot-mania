import test from "node:test";
import assert from "node:assert/strict";
import { resetTrainTunnel, getTrainTunnel, restoreTrainTunnel, stepTrainTunnel, tunnelHoopMin, tunnelGeometry, collideTunnel } from "./train-tunnel.ts";
import { resetTrainScroll, getTrainScroll, startTrainScroll, stepTrainScroll } from "./train-bg.ts";
import { getTrainGantries, getTrainGantryWarnings } from "./train-gantry.ts";
const world = { w: 390, h: 844, floorY: 730, ballR: 19.5 };
function cruise() { resetTrainScroll(); startTrainScroll(); stepTrainScroll(12); return getTrainScroll(); }

test("only cruise can reserve a tunnel, random roof never exceeds upper 30%", () => {
  for (const phase of ["parked", "accel", "decel"] as const) {
    const route = cruise(); resetTrainTunnel();
    stepTrainTunnel({ ...route, phase }, world, 1, () => true);
    assert.equal(getTrainTunnel().stage, "idle");
  }
  for (const random of [0, 0.2, 0.5, 0.99]) {
    const route = cruise(); stepTrainTunnel(route, world, 0.01, () => true, () => random);
    assert.ok(getTrainTunnel().depth >= 0 && getTrainTunnel().depth <= 0.3);
  }
});
test("unsafe existing hoop or occupied ball defers entrance; late unsafe tunnel is skipped", () => {
  const route = cruise(); stepTrainTunnel(route, world, 1, () => false, () => 0.99);
  assert.equal(getTrainTunnel().stage, "waiting");
  assert.ok(tunnelHoopMin(world) > world.h * 0.48);
  stepTrainTunnel({ ...route, phaseT: 20 }, world, 1, () => false);
  assert.equal(getTrainTunnel().stage, "waiting");
  stepTrainTunnel({ ...route, phaseT: 40 }, world, 1, () => false);
  assert.equal(getTrainTunnel().stage, "done");
});
test("safe entry has two second approach, short traversal, no gantries or warnings, one per leg", () => {
  const route = cruise(); stepTrainTunnel(route, world, 0, () => true, () => 0.8);
  assert.equal(getTrainTunnel().stage, "passing");
  assert.equal(tunnelGeometry(world).x, world.w + 1080);
  assert.deepEqual(getTrainGantries(world, getTrainScroll(), 10000), []);
  assert.deepEqual(getTrainGantryWarnings(world, getTrainScroll()), []);
  stepTrainTunnel(route, world, 3, () => true);
  assert.ok(tunnelGeometry(world).x < 0);
  stepTrainTunnel(route, world, 6, () => true);
  assert.equal(getTrainTunnel().stage, "done");
  stepTrainTunnel(route, world, 1, () => true);
  assert.equal(getTrainTunnel().stage, "done");
});
test("ceiling sweep rebounds a fast ball and leaves a ball below ceiling unchanged", () => {
  const route = cruise(); stepTrainTunnel(route, world, 0, () => true, () => 0.9);
  stepTrainTunnel(route, world, 4, () => true);
  const roof = tunnelGeometry(world).roof;
  const ball = { x: 190, y: roof - 60, vx: 0, vy: -1000, r: 20 };
  assert.equal(collideTunnel(world, ball, 190, roof + 90, 0.1), true);
  assert.ok(ball.y >= roof + ball.r && ball.vy > 0);
  ball.y = roof + 100; ball.vy = 20;
  assert.equal(collideTunnel(world, ball, 190, roof + 90, 0.1), false);
});
test("reset and rewind restore tunnel constraints with the visible state", () => {
  const route = cruise(); stepTrainTunnel(route, world, 0, () => true);
  const saved = getTrainTunnel(); resetTrainTunnel();
  assert.equal(tunnelHoopMin(world), 0);
  restoreTrainTunnel(saved); assert.deepEqual(getTrainTunnel(), saved);
  resetTrainScroll(); assert.equal(getTrainTunnel().stage, "idle");
});
