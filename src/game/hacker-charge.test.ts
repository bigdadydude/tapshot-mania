import test from "node:test";
import assert from "node:assert/strict";
import {
  HACKER_CHARGE,
  HACKER_CHARGE_COLORS,
  addHackerMake,
  beginChargeHold,
  chargeCap,
  chargeDisplayMakes,
  chargeLayerRatios,
  createHackerCharge,
  aimTimedOut,
  chargeHoldArmed,
  stepAimArrow,
  releaseChargeHold,
  stepChargeHold,
} from "./hacker-charge.ts";

function filled(makes: number) {
  const s = createHackerCharge();
  for (let i = 0; i < makes; i++) assert.equal(addHackerMake(s), true);
  return s;
}

function drain(s: ReturnType<typeof filled>, makes: number) {
  assert.equal(beginChargeHold(s), true);
  const seconds = (makes / HACKER_CHARGE.makesPerLayer) * HACKER_CHARGE.layerDrainSeconds;
  stepChargeHold(s, seconds);
}

test("fair-weather makes fill one layer per five and cap at three", () => {
  const s = createHackerCharge();
  assert.deepEqual(chargeLayerRatios(0), [0, 0, 0]);
  for (let i = 0; i < 5; i++) addHackerMake(s);
  assert.deepEqual(chargeLayerRatios(s.makes), [1, 0, 0]);
  for (let i = 0; i < 5; i++) addHackerMake(s);
  assert.deepEqual(chargeLayerRatios(s.makes), [1, 1, 0]);
  assert.deepEqual(chargeLayerRatios(3), [0.6, 0, 0]);
  for (let i = 0; i < 10; i++) addHackerMake(s);
  assert.equal(s.makes, chargeCap());
  assert.equal(addHackerMake(s), false);
  assert.deepEqual(chargeLayerRatios(s.makes), [1, 1, 1]);
  assert.deepEqual(HACKER_CHARGE_COLORS, ["#5CE1FF", "#00FF41", "#C77DFF"]);
});

test("a hold drains the meter and a mid-layer release restores that progress", () => {
  const s = filled(10);
  drain(s, 2);
  assert.ok(Math.abs(chargeDisplayMakes(s) - 8) < 1e-6);
  assert.equal(releaseChargeHold(s), "none");
  assert.equal(s.makes, 10);
  assert.equal(s.holding, false);
  assert.equal(releaseChargeHold(s), "none");
});

test("releasing on a finished layer spends only whole layers", () => {
  const arrow = filled(10);
  drain(arrow, 5);
  assert.equal(releaseChargeHold(arrow), "arrow");
  assert.equal(arrow.makes, 5);

  const lock = filled(15);
  drain(lock, 10);
  assert.equal(releaseChargeHold(lock), "lock");
  assert.equal(lock.makes, 5);

  const rain = filled(15);
  drain(rain, 15);
  assert.equal(releaseChargeHold(rain), "rain");
  assert.equal(rain.makes, 0);
});

test("draining past a layer boundary restores the unfinished layer", () => {
  const s = filled(15);
  drain(s, 7);
  assert.equal(releaseChargeHold(s), "arrow");
  assert.equal(s.makes, 10);
});

test("under three layers, holding to empty locks at most two and refunds the remainder", () => {
  const partial = filled(13);
  drain(partial, 13);
  assert.equal(chargeDisplayMakes(partial), 0);
  assert.equal(releaseChargeHold(partial), "lock");
  assert.equal(partial.makes, 3);

  const one = filled(7);
  drain(one, 7);
  assert.equal(releaseChargeHold(one), "arrow");
  assert.equal(one.makes, 2);

  const none = filled(4);
  drain(none, 4);
  assert.equal(releaseChargeHold(none), "none");
  assert.equal(none.makes, 4);

  const almost = filled(14);
  drain(almost, 14);
  assert.equal(releaseChargeHold(almost), "lock");
  assert.equal(almost.makes, 4);
});

test("a full three-layer bar released inside the last layer does not open the rain", () => {
  const s = filled(15);
  drain(s, 12);
  assert.equal(releaseChargeHold(s), "lock");
  assert.equal(s.makes, 5);
});

test("holding blocks new makes and an empty meter does not start a hold", () => {
  const s = filled(2);
  assert.equal(beginChargeHold(s), true);
  assert.equal(addHackerMake(s), false);
  assert.equal(s.holdStart, 2);
  const empty = createHackerCharge();
  assert.equal(beginChargeHold(empty), false);
});

test("drain waits until the press is longer than 0.3s", () => {
  assert.equal(HACKER_CHARGE.holdArmSeconds, 0.3);
  assert.equal(chargeHoldArmed(0.3), false);
  assert.equal(chargeHoldArmed(0.31), true);
});

test("the aim arrow moves on its own, bounces, and times out at 3s", () => {
  assert.equal(HACKER_CHARGE.aimTimeoutSeconds, 3);
  assert.equal(HACKER_CHARGE.failFreezeSeconds, 0.2);
  assert.equal(aimTimedOut(2.99), false);
  assert.equal(aimTimedOut(3), true);
  const forward = stepAimArrow(10, 1, 0.2, 0, 100);
  assert.ok(forward.landX > 10);
  assert.equal(forward.dir, 1);
  const bounced = stepAimArrow(99, 1, 1, 0, 100);
  assert.equal(bounced.landX, 100);
  assert.equal(bounced.dir, -1);
});
