import test from "node:test";
import assert from "node:assert/strict";
import { createAntiRecovery, launchAntiRecovery, scoreAntiRecovery, stepAntiRecovery, antiRecoveryIgnoresHoops, assistAntiHoop } from "./anti-recovery.ts";

const center = { x: 200, y: 330 };
const hoops = [{ x: 350, y: 300, inner: 25 }];
const body = () => ({ x: 200, y: 330, vx: 220, vy: -420, r: 18 });
const step = (s: ReturnType<typeof createAntiRecovery>, b: ReturnType<typeof body>, dt = 1 / 120) => {
  stepAntiRecovery(s, b, center, hoops, 740, 1000, dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
};

test("a fresh tap retains normal jump velocity without homing or forced orbit", () => {
  const s = createAntiRecovery(), b = body();
  launchAntiRecovery(s);
  for (let i = 0; i < 24; i++) step(s, b);
  assert.equal(s.mode, "flight");
  assert.equal(b.vx, 220);
  assert.ok(Math.abs(b.vy - (-420 + 200)) < 1e-6);
});

test("rim vicinity remains protected after the launch grace expires", () => {
  const s = createAntiRecovery(), b = { ...body(), x: 350, y: 310, vy: 60 };
  launchAntiRecovery(s); s.grace = 0;
  step(s, b);
  assert.equal(s.mode, "flight");
});

test("misses are caught above the floor, then settle without orbit at several frame rates", () => {
  for (const dt of [1 / 60, 1 / 120, 1 / 144]) {
    const s = createAntiRecovery(), b = { ...body(), x: 370, y: 590, vy: 1200 };
    launchAntiRecovery(s);
    for (let t = 0; t < 3; t += dt) {
      step(s, b, dt);
      assert.ok(b.y + b.r < 740, "no floor contact");
      assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy));
    }
    assert.equal(s.mode, "ready");
    assert.ok(Math.hypot(b.x - center.x, b.y - center.y) < 1.6);
    assert.ok(Math.hypot(b.vx, b.vy) < 1);
  }
});

test("made baskets return sooner than misses, with a short net clearance delay", () => {
  const times: number[] = [];
  for (const made of [true, false]) {
    const s = createAntiRecovery(), b = { ...body(), x: 350, y: 340, vx: 0, vy: 80 };
    if (made) scoreAntiRecovery(s);
    let t = 0;
    for (; t < 3 && s.mode !== "ready"; t += 1 / 120) step(s, b);
    times.push(t);
  }
  assert.ok(times[0]! < times[1]!, `${times}`);
});

test("a tap immediately interrupts either kind of return", () => {
  for (const made of [true, false]) {
    const s = createAntiRecovery(), b = body();
    if (made) scoreAntiRecovery(s);
    for (let i = 0; i < 25; i++) step(s, b);
    launchAntiRecovery(s); b.vx = -220; b.vy = -420;
    step(s, b);
    assert.equal(s.mode, "flight");
    assert.equal(s.scored, false);
    assert.equal(b.vx, -220);
    assert.ok(b.vy < -400);
  }
});

test("a descending shot below the hole center stays free to reach a low basket", () => {
  for (const dt of [1 / 60, 1 / 120, 1 / 144]) {
    const s = createAntiRecovery(), b = { ...body(), x: 160, y: 390, vx: 170, vy: 260 };
    const lowHoop = { x: 300, y: 640, inner: 25 };
    launchAntiRecovery(s); s.grace = 0;
    while (b.y < lowHoop.y) {
      stepAntiRecovery(s, b, center, [lowHoop], 740, 1000, dt);
      assert.equal(s.mode, "flight", `must not recall above rim, y=${b.y}`);
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
  }
});

test("fast downward approaches to low hoops are not recalled by predicted floor contact", () => {
  const s = createAntiRecovery(), b = { ...body(), x: 350, y: 590, vx: 0, vy: 900 };
  launchAntiRecovery(s); s.grace = 0;
  stepAntiRecovery(s, b, center, [{ x: 350, y: 640, inner: 25 }], 740, 1000, 1/120);
  assert.equal(s.mode, "flight");
});

test("a missed return keeps solid hoops and scoring; only completed baskets and parked balls are protected", () => {
  const s = createAntiRecovery();
  assert.equal(antiRecoveryIgnoresHoops(s), false);
  scoreAntiRecovery(s); s.delay = 0;
  assert.equal(antiRecoveryIgnoresHoops(s), true);
  launchAntiRecovery(s);
  assert.equal(antiRecoveryIgnoresHoops(s), false);
  s.mode = "ready";
  assert.equal(antiRecoveryIgnoresHoops(s), true);
});

test("a near miss receives a modest, symmetric correction toward the rim at multiple frame rates", () => {
  const offsets: number[] = [];
  for (const dt of [1/60, 1/120, 1/144]) {
    for (const sign of [-1, 1]) {
      const b = { ...body(), x: 350 + sign * 35, y: 210, vx: 0, vy: 80 };
      while (b.y < 300) {
        const vy = b.vy;
        assistAntiHoop(b, hoops, 1000, dt);
        assert.equal(b.vy, vy, "assist never alters the vertical shot timing");
        b.vy += 1000 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      }
      const error = Math.abs(b.x - 350);
      assert.ok(error < 33 && error > 20, `small correction, not a guaranteed basket: ${error}`);
      offsets.push(error);
    }
  }
  assert.ok(Math.max(...offsets)-Math.min(...offsets) < 1);
});

test("rising shots, distant misses and balls already below the rim receive no attraction", () => {
  for (const b of [
    {...body(),x:380,y:260,vy:-80},
    {...body(),x:100,y:260,vy:80},
    {...body(),x:380,y:305,vy:80},
    {...body(),x:380,y:100,vy:80},
  ]) {
    const before = {...b}; assistAntiHoop(b, hoops, 1000, 1/60);
    assert.deepEqual(b,before);
  }
  const b = {...body(),x:380,y:260,vy:80}, before = {...b};
  assistAntiHoop(b,[{...hoops[0]!,scoreable:false}],1000,1/60);
  assert.deepEqual(b,before,"non-scoring decoys do not attract the ball");
});

test("two eligible hoops do not stack attraction and returns are not pulled off course", () => {
  const a={...body(),x:380,y:260,vy:80}, b={...a};
  assistAntiHoop(a,hoops,1000,1/60);assistAntiHoop(b,[...hoops,...hoops],1000,1/60);
  assert.deepEqual(a,b);
  const s=createAntiRecovery(), r1={...b}, r2={...b};
  stepAntiRecovery(s,r1,center,hoops,740,1000,1/60);
  stepAntiRecovery(createAntiRecovery(),r2,center,[],740,1000,1/60);
  assert.deepEqual(r1,r2);
});
