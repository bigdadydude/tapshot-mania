import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAIN_ACCEL_SEC, TRAIN_DECEL_SEC, TRAIN_DWELL_SEC, TRAIN_INITIAL_TRAVEL_SEC,
  TRAIN_INERTIA_K, TRAIN_PARALLAX, TRAIN_SPEED_MAX,
  getTrainScroll, resetTrainScroll, startTrainScroll, stepTrainScroll,
  trainAccel, trainGravScale, trainInertiaAccel, trainJourney, trainStationOffsets, trainScrollShift,
} from "./train-bg.ts";
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const launch = () => { resetTrainScroll(); startTrainScroll(); };

test("first station waits indefinitely for a real basket; reset restores all route state", () => {
  resetTrainScroll(); const before = getTrainScroll();
  stepTrainScroll(360); assert.deepEqual(getTrainScroll(), before);
  assert.equal(trainInertiaAccel(), 0);
  startTrainScroll(); stepTrainScroll(12); resetTrainScroll();
  assert.deepEqual(getTrainScroll(), before);
});

test("first trip is exactly 60 seconds, stops at its target, dwells five seconds then departs", () => {
  launch(); const destination = getTrainScroll().nextStationAt;
  stepTrainScroll(TRAIN_ACCEL_SEC); assert.equal(getTrainScroll().phase, "cruise");
  close(getTrainScroll().trainSpeed, TRAIN_SPEED_MAX);
  stepTrainScroll(TRAIN_INITIAL_TRAVEL_SEC - TRAIN_ACCEL_SEC - TRAIN_DECEL_SEC);
  assert.equal(getTrainScroll().phase, "decel");
  stepTrainScroll(TRAIN_DECEL_SEC);
  const arrival = getTrainScroll();
  assert.equal(arrival.phase, "parked"); assert.equal(arrival.stationIndex, 1);
  close(arrival.elapsed, 60); close(arrival.near, destination); close(arrival.trainSpeed, 0);
  close(trainInertiaAccel(), 0); assert.deepEqual(trainStationOffsets(), [0]);
  stepTrainScroll(4.99); close(getTrainScroll().near, destination);
  assert.equal(getTrainScroll().phase, "parked");
  startTrainScroll(); assert.equal(getTrainScroll().phase, "parked", "basket cannot skip dwell");
  stepTrainScroll(0.01); assert.equal(getTrainScroll().phase, "accel");
  close(getTrainScroll().phaseT, 0); close(getTrainScroll().trainSpeed, 0);
  close(getTrainScroll().legSeconds, 73);
});

test("acceleration rises from zero, peaks mid-ramp and returns to zero continuously", () => {
  close(trainAccel("accel", 0), 0);
  const a1 = trainAccel("accel", TRAIN_ACCEL_SEC / 4);
  const peak = trainAccel("accel", TRAIN_ACCEL_SEC / 2);
  assert.ok(a1 > 0 && peak > a1);
  close(trainAccel("accel", TRAIN_ACCEL_SEC * 0.75), a1);
  close(trainAccel("accel", TRAIN_ACCEL_SEC), 0);
  close(trainAccel("cruise", 0), 0);
  close(trainAccel("decel", 0), 0);
  assert.ok(trainAccel("decel", TRAIN_DECEL_SEC / 2) < 0);
  close(trainAccel("decel", TRAIN_DECEL_SEC), 0);
  launch(); stepTrainScroll(TRAIN_ACCEL_SEC / 2);
  close(getTrainScroll().trainSpeed, TRAIN_SPEED_MAX / 2);
  assert.ok(trainInertiaAccel() < 0);
});

test("analytic acceleration matches the derivative of simulated speed", () => {
  const t = 2.2, epsilon = 0.0001;
  for (const offset of [0, TRAIN_INITIAL_TRAVEL_SEC - TRAIN_DECEL_SEC]) {
    launch(); stepTrainScroll(offset + t - epsilon); const v0 = getTrainScroll().trainSpeed;
    stepTrainScroll(epsilon); const a = trainAccel();
    stepTrainScroll(epsilon); const v1 = getTrainScroll().trainSpeed;
    close((v1 - v0) / (2 * epsilon), a, 1e-5);
  }
});

test("frame subdivision and one large update agree across several arrivals and dwells", () => {
  launch(); stepTrainScroll(330.5); const once = getTrainScroll();
  launch(); for (let i = 0; i < 19830; i++) stepTrainScroll(1 / 60);
  const many = getTrainScroll();
  assert.equal(many.phase, once.phase); assert.equal(many.stationIndex, once.stationIndex);
  for (const key of ["near", "mid", "far", "elapsed", "phaseT", "trainSpeed", "nextStationAt"] as const) close(many[key], once[key], 1e-5);
});

test("destinations are fixed at departure, grow with active time, and appear ahead before arrival", () => {
  assert.ok(trainJourney(120).distance > trainJourney(60).distance);
  launch(); const first = getTrainScroll().nextStationAt;
  stepTrainScroll(58); assert.equal(getTrainScroll().nextStationAt, first);
  const [behind, ahead] = trainStationOffsets();
  assert.ok(behind! < 0 && ahead! > 0 && ahead! < 100);
  stepTrainScroll(2); assert.deepEqual(trainStationOffsets(), [0]);
  stepTrainScroll(TRAIN_DWELL_SEC); const next = getTrainScroll();
  assert.ok(next.legDistance > first);
  stepTrainScroll(next.legSeconds); const second = getTrainScroll();
  assert.equal(second.stationIndex, 2); assert.equal(second.phase, "parked");
  close(second.near, next.nextStationAt); assert.deepEqual(trainStationOffsets(), [0]);
});

test("parallax maintains spatial ratios while inertia scales with ball gravity", () => {
  launch(); stepTrainScroll(3);
  const s = getTrainScroll();
  close(s.mid / s.near, TRAIN_PARALLAX.mid); close(s.far / s.near, TRAIN_PARALLAX.far);
  const basic = trainInertiaAccel();
  close(trainInertiaAccel(undefined, TRAIN_INERTIA_K, trainGravScale(1.4, 1)), basic * 1.4);
  close(trainInertiaAccel(undefined, TRAIN_INERTIA_K, trainGravScale(0.9, 1)), basic * 0.9);
  assert.equal(trainGravScale(2, 0), 1);
  stepTrainScroll(54); assert.ok(trainInertiaAccel() > 0);
});

test("invalid steps and duplicate launch calls do not mutate a moving route", () => {
  launch(); stepTrainScroll(1); const before = getTrainScroll();
  for (const dt of [0, -1, NaN, Infinity]) stepTrainScroll(dt);
  startTrainScroll(); assert.deepEqual(getTrainScroll(), before);
  assert.equal(trainScrollShift(400, 390), 10);
  assert.equal(trainScrollShift(-10, 390), 380);
});
