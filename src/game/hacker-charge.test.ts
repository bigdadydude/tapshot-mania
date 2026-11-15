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
  hackerLensBands,
  stepHackerRipples,
  releaseChargeHold,
  chargeIsFull,
  stepChargeHold,
  stepChargeDecay,
  stepChargeGlow,
  settledHackerCharge,
  createHackerProgress,
  hackerComboBonus,
  awardHackerArrow,
  bankHackerCombo,
  hackerClockScale,
} from "./hacker-charge.ts";

test("each newly completed layer glows once, including rain-style refills", () => {
  const s = filled(4);
  assert.deepEqual(s.layerGlow, [0, 0, 0]);
  for (let layer = 0; layer < 3; layer++) {
    if (layer > 0) for (let i = 0; i < 4; i++) addHackerMake(s);
    addHackerMake(s);
    assert.equal(s.layerGlow[layer], HACKER_CHARGE.layerGlowSeconds);
    stepChargeGlow(s, 1);
    assert.deepEqual(s.layerGlow, [0, 0, 0]);
  }
  assert.equal(addHackerMake(s), false);
  assert.deepEqual(s.layerGlow, [0, 0, 0]);
  drain(s, 5);
  releaseChargeHold(s);
  for (let i = 0; i < 5; i++) addHackerMake(s);
  assert.deepEqual(s.layerGlow, [0, 0, HACKER_CHARGE.layerGlowSeconds]);
});

test("decay refills glow, refunds do not, and snapshots discard transient glow", () => {
  const s = filled(5);
  stepChargeGlow(s, 1);
  stepChargeDecay(s, 3.5);
  addHackerMake(s);
  assert.equal(s.layerGlow[0], HACKER_CHARGE.layerGlowSeconds);
  stepChargeGlow(s, 0);
  stepChargeGlow(s, -1);
  assert.equal(s.layerGlow[0], HACKER_CHARGE.layerGlowSeconds);
  stepChargeGlow(s, 0.2);
  assert.ok(Math.abs(s.layerGlow[0] - (HACKER_CHARGE.layerGlowSeconds - 0.2)) < 1e-9);
  assert.deepEqual(settledHackerCharge(s).layerGlow, [0, 0, 0]);
  stepChargeGlow(s, 1);
  drain(s, 1);
  assert.equal(releaseChargeHold(s), "none");
  assert.deepEqual(s.layerGlow, [0, 0, 0]);
  addHackerMake(s, false);
  assert.deepEqual(s.layerGlow, [0, 0, 0]);
});

test("decay starts after three seconds and drains one point per second", () => {
  const s = filled(15);
  stepChargeDecay(s, 3);
  assert.equal(s.makes, 15);
  stepChargeDecay(s, 1);
  assert.equal(s.makes, 14);
  stepChargeDecay(s, 4);
  assert.equal(s.makes, 10);
  stepChargeDecay(s, 100);
  assert.equal(s.makes, 0);
});

test("crossing the grace boundary only drains the excess time, independent of step size", () => {
  const a = filled(10), b = filled(10);
  stepChargeDecay(a, 2.9); stepChargeDecay(a, 0.3);
  for (let i = 0; i < 192; i++) stepChargeDecay(b, 1 / 60);
  assert.ok(Math.abs(a.makes - 9.8) < 1e-9);
  assert.ok(Math.abs(a.makes - b.makes) < 1e-9);
  stepChargeDecay(a, 0); stepChargeDecay(a, -1);
  assert.ok(Math.abs(a.makes - 9.8) < 1e-9);
});

test("makes renew grace even at cap, and fractional charge cannot overflow", () => {
  const s = filled(15);
  stepChargeDecay(s, 2.9); addHackerMake(s); stepChargeDecay(s, 3);
  assert.equal(s.makes, 15);
  stepChargeDecay(s, 0.4); addHackerMake(s);
  assert.equal(s.makes, 15);
  stepChargeDecay(s, 4); addHackerMake(s, false);
  assert.equal(s.makes, 14); // Awakening make resets grace without charging.
  stepChargeDecay(s, 3);
  assert.equal(s.makes, 14);
});

test("holding and refunding cannot restore passive loss or spend it as a layer", () => {
  const s = filled(10);
  stepChargeDecay(s, 3); beginChargeHold(s);
  stepChargeHold(s, 0.2); stepChargeDecay(s, 1);
  assert.equal(settledHackerCharge(s).makes, 9);
  assert.equal(settledHackerCharge(s).idleSeconds, 4);
  assert.equal(releaseChargeHold(s), "none");
  assert.equal(s.makes, 9);
  stepChargeDecay(s, 1);
  assert.equal(s.makes, 8);
  const full = filled(15);
  stepChargeDecay(full, 3); drain(full, 15); stepChargeDecay(full, 1);
  assert.equal(releaseChargeHold(full), "lock");
  assert.equal(full.makes, 4);
});

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

test("skills arm and spend faster without delaying taps", () => {
  assert.equal(HACKER_CHARGE.holdArmSeconds, 0.22);
  assert.equal(HACKER_CHARGE.layerDrainSeconds, 0.32);
  assert.equal(chargeHoldArmed(0.22), false);
  assert.equal(chargeHoldArmed(0.23), true);
  assert.ok(HACKER_CHARGE.holdArmSeconds + 3 * HACKER_CHARGE.layerDrainSeconds < 1.65);
});

test("spend ripples are staggered lens bands that bend pixels, then expire", () => {
  const early = hackerLensBands({ x: 40, y: 50, age: 0.16, kind: "burst" }, 20);
  assert.ok(early.length >= 2);
  assert.ok(early.every((band) => band.strength > 0 && band.half > 0));
  assert.ok(early[0]!.radius > early[1]!.radius);
  assert.equal(hackerLensBands({ x: 0, y: 0, age: 0, kind: "burst" }, 20).length, 0);
  const gone = stepHackerRipples([{ x: 0, y: 0, age: 0.6, kind: "burst" }], 0.2);
  assert.equal(gone.length, 0);
  const live = stepHackerRipples([{ x: 1, y: 2, age: 0, kind: "pulse" }], 0.1);
  assert.equal(live.length, 1);
  assert.equal(live[0]!.age, 0.1);
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

test("code-world arrow rewards stack and evacuation banks them exactly once", () => {
  const s = createHackerProgress();
  assert.equal(hackerComboBonus(s, false), 0);
  awardHackerArrow(s);
  awardHackerArrow(s);
  assert.equal(hackerComboBonus(s, true), 2);
  assert.equal(hackerComboBonus(s, false), 0);
  bankHackerCombo(s);
  assert.equal(hackerComboBonus(s, false), 2);
  assert.equal(hackerComboBonus(s, true), 2);
  bankHackerCombo(s);
  assert.equal(hackerComboBonus(s, false), 2);
  awardHackerArrow(s);
  assert.equal(hackerComboBonus(s, true), 3);
  assert.equal(hackerComboBonus(s, false), 2);
  bankHackerCombo(s);
  assert.equal(hackerComboBonus(s, false), 3);
  assert.deepEqual(createHackerProgress(), { bankedCombo: 0, codeCombo: 0 });
});

test("code clock penalty is reversible and does not compound over refills", () => {
  let remaining = 12;
  remaining *= hackerClockScale(true) / hackerClockScale(false);
  assert.ok(Math.abs(remaining - 11.28) < 1e-9);
  remaining *= hackerClockScale(false) / hackerClockScale(true);
  assert.ok(Math.abs(remaining - 12) < 1e-9);
  for (const base of [15, 9, 2.6, 60]) {
    assert.equal(base * hackerClockScale(true), base * 0.94);
    assert.equal(base * hackerClockScale(false), base);
  }
});

test("both worlds spend whole tiers, refund partial progress, and expose full charge", () => {
  const s = filled(15);
  assert.equal(chargeIsFull(s), true);
  drain(s, 7);
  assert.equal(releaseChargeHold(s), "arrow");
  assert.equal(s.makes, 10);
  drain(s, 10);
  assert.equal(releaseChargeHold(s), "lock");
  assert.equal(s.makes, 0);
  const full = filled(15);
  drain(full, 15);
  assert.equal(releaseChargeHold(full), "rain");
  assert.equal(full.makes, 0);
});

test("code skill baskets shrink their world budget by two percent each, cleared on exit", () => {
 assert.equal(hackerClockScale(true,1),.94*.98);
 assert.equal(hackerClockScale(true,2),.94*.98*.98);
 assert.equal(hackerClockScale(false,5),1);
 assert.equal(hackerClockScale(true,0),.94);
});
