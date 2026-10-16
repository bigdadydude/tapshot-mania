import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAIN_ACCEL_SEC,
  TRAIN_CRUISE_SEC,
  TRAIN_DECEL_SEC,
  TRAIN_INERTIA_K,
  TRAIN_PARALLAX,
  TRAIN_SPEED_MAX,
  TRAIN_SPEED_MIN,
  getTrainScroll,
  resetTrainScroll,
  stepTrainScroll,
  trainAccel,
  trainInertiaAccel,
  trainScrollShift,
} from "./train-bg.ts";

const CYCLE = TRAIN_ACCEL_SEC + TRAIN_CRUISE_SEC + TRAIN_DECEL_SEC;

test("cycle starts slow, reaches cruise speed, and returns to accel", () => {
  resetTrainScroll();
  const start = getTrainScroll();
  assert.equal(start.phase, "accel");
  assert.equal(start.trainSpeed, TRAIN_SPEED_MIN);
  assert.equal(start.near, 0);

  stepTrainScroll(TRAIN_ACCEL_SEC);
  const cruise = getTrainScroll();
  assert.equal(cruise.phase, "cruise");
  assert.equal(cruise.phaseT, 0);
  assert.ok(Math.abs(cruise.trainSpeed - TRAIN_SPEED_MAX) < 1e-6);

  stepTrainScroll(TRAIN_CRUISE_SEC);
  assert.equal(getTrainScroll().phase, "decel");

  stepTrainScroll(TRAIN_DECEL_SEC);
  const again = getTrainScroll();
  assert.equal(again.phase, "accel");
  assert.ok(again.phaseT < 1e-6);
  assert.ok(Math.abs(again.trainSpeed - TRAIN_SPEED_MIN) < 1e-6);
});

test("accel ramps up and decel ramps down", () => {
  resetTrainScroll();
  let prev = TRAIN_SPEED_MIN;
  const accelSteps = 8;
  for (let i = 1; i <= accelSteps; i++) {
    resetTrainScroll();
    stepTrainScroll((TRAIN_ACCEL_SEC / accelSteps) * i);
    const speed = getTrainScroll().trainSpeed;
    assert.ok(speed >= prev - 1e-6);
    prev = speed;
  }
  assert.ok(Math.abs(prev - TRAIN_SPEED_MAX) < 1e-6);

  resetTrainScroll();
  stepTrainScroll(TRAIN_ACCEL_SEC + TRAIN_CRUISE_SEC);
  prev = TRAIN_SPEED_MAX;
  const decelSteps = 8;
  for (let i = 1; i <= decelSteps; i++) {
    resetTrainScroll();
    stepTrainScroll(TRAIN_ACCEL_SEC + TRAIN_CRUISE_SEC + (TRAIN_DECEL_SEC / decelSteps) * i);
    const speed = getTrainScroll().trainSpeed;
    assert.ok(speed <= prev + 1e-6);
    prev = speed;
  }
  assert.equal(getTrainScroll().phase, "accel");
  assert.ok(Math.abs(prev - TRAIN_SPEED_MIN) < 1e-6);
});

test("subdivided accel travels the same distance as one slice", () => {
  resetTrainScroll();
  stepTrainScroll(TRAIN_ACCEL_SEC);
  const once = getTrainScroll().near;

  resetTrainScroll();
  const steps = 60;
  const dt = TRAIN_ACCEL_SEC / steps;
  let covered = 0;
  for (let i = 0; i < steps - 1; i++) {
    stepTrainScroll(dt);
    covered += dt;
  }
  stepTrainScroll(TRAIN_ACCEL_SEC - covered);
  const many = getTrainScroll().near;
  const expected = ((TRAIN_SPEED_MIN + TRAIN_SPEED_MAX) / 2) * TRAIN_ACCEL_SEC;
  assert.ok(Math.abs(once - expected) < 1e-4);
  assert.ok(Math.abs(many - expected) < 1e-4);
  assert.equal(getTrainScroll().phase, "cruise");
});

test("parallax layers scroll at 1 / 0.45 / 0.15 and move backward", () => {
  resetTrainScroll();
  stepTrainScroll(TRAIN_ACCEL_SEC);
  const a = getTrainScroll();
  stepTrainScroll(1);
  const b = getTrainScroll();
  const near = b.near - a.near;
  const mid = b.mid - a.mid;
  const far = b.far - a.far;
  assert.ok(near > 0 && mid > 0 && far > 0);
  assert.ok(Math.abs(near - TRAIN_SPEED_MAX * TRAIN_PARALLAX.near) < 1e-4);
  assert.ok(Math.abs(mid / near - TRAIN_PARALLAX.mid) < 1e-6);
  assert.ok(Math.abs(far / near - TRAIN_PARALLAX.far) < 1e-6);
  assert.ok(near > mid && mid > far);
});

test("a full cycle in one step lands back on the slow accel start", () => {
  resetTrainScroll();
  stepTrainScroll(CYCLE);
  const s = getTrainScroll();
  assert.equal(s.phase, "accel");
  assert.ok(s.phaseT < 1e-6);
  assert.ok(Math.abs(s.trainSpeed - TRAIN_SPEED_MIN) < 1e-6);
});

test("tile shift repeats exactly one tile later and moves scenery left", () => {
  const tile = 390;
  assert.equal(trainScrollShift(10, tile), 10);
  assert.equal(trainScrollShift(tile, tile), 0);
  assert.equal(trainScrollShift(tile + 10, tile), 10);
  assert.equal(trainScrollShift(tile * 4 + 10, tile), trainScrollShift(10, tile));
  assert.equal(trainScrollShift(-10, tile), tile - 10);
  const x0 = -trainScrollShift(0, tile);
  const x1 = -trainScrollShift(30, tile);
  assert.ok(x1 < x0);
});

test("train acceleration is the linear ramp, and the ball feels the opposite", () => {
  const span = TRAIN_SPEED_MAX - TRAIN_SPEED_MIN;
  const accel = span / TRAIN_ACCEL_SEC;
  const decel = -span / TRAIN_DECEL_SEC;
  assert.ok(Math.abs(trainAccel("accel") - accel) < 1e-9);
  assert.equal(trainAccel("cruise"), 0);
  assert.ok(Math.abs(trainAccel("decel") - decel) < 1e-9);
  assert.ok(trainAccel("accel") > 0);
  assert.ok(trainAccel("decel") < 0);

  assert.ok(Math.abs(trainInertiaAccel("accel") - -accel * TRAIN_INERTIA_K) < 1e-9);
  assert.equal(trainInertiaAccel("cruise"), 0);
  assert.ok(Math.abs(trainInertiaAccel("decel") - -decel * TRAIN_INERTIA_K) < 1e-9);
  assert.ok(trainInertiaAccel("accel") < 0);
  assert.ok(trainInertiaAccel("decel") > 0);

  resetTrainScroll();
  assert.equal(trainAccel(), trainAccel("accel"));
  stepTrainScroll(TRAIN_ACCEL_SEC);
  assert.equal(trainAccel(), 0);
  stepTrainScroll(TRAIN_CRUISE_SEC);
  assert.ok(trainAccel() < 0);
});

test("non-positive dt does not move the train", () => {
  resetTrainScroll();
  stepTrainScroll(0);
  stepTrainScroll(-1);
  const s = getTrainScroll();
  assert.equal(s.phase, "accel");
  assert.equal(s.near, 0);
  assert.equal(s.trainSpeed, TRAIN_SPEED_MIN);
});
