import assert from "node:assert/strict";
import test from "node:test";
import { TRAFFIC_ABSORB_SECONDS, TRAFFIC_BURN_SECONDS, beginTrafficAbsorption, bridgeY, collideTraffic, createTraffic, grantTrafficSafe, stepTraffic, stepTrafficNearMiss, updateTrafficHackerSlide, trafficClearance, trafficOutOfBounds, trafficSpeed, vehicleBounds, vehicleSize, type Vehicle, type VehicleKind } from "./traffic.ts";
import type { Ball, World } from "./types.ts";

const world: World = { w: 390, h: 844, floorY: 844 * 0.765, ballR: 19.5, hoopInner: 28, tube: 4, cssW: 390, cssH: 844, ox: 0, oy: 0 };
const ballAt = (x: number, y: number): Ball => ({ x, y, vx: 0, vy: 0, r: 19.5, spin: 0, omega: 0, squash: 1, scored: false, hitBoard: false, hitRim: false });
const car = (kind: VehicleKind, dir: -1 | 1, lane: "bridge" | "ground" = "ground"): Vehicle => ({ id: 1, kind, dir, lane, x: 190, prevX: 190 - dir * 5, speed: 300, tint: 0 });

test("passing a car awards only after leaving the one-diameter range and only once", () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v];
  const bounds = vehicleBounds(v, world);
  const edge = bounds.x + bounds.w * 0.98;
  const ball = ballAt(edge + 19.5 * 3 + 0.01, bounds.bottom - 20);
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0);
  ball.x -= 0.02;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0, "approaching only arms the encounter");
  for (let i = 0; i < 60; i++) stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0, "remaining nearby cannot award");
  ball.x += 0.02;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 1);
  ball.x = edge + ball.r - 1;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0, "touching the car interrupts the streak");
  ball.x = edge + ball.r * 2;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0, "the same car cannot award a second time");
});

test("every arrival is outside the screen until its 1.8-second warning completes", () => {
  const state = createTraffic();
  const seen = new Set<number>();
  const firstWarning = new Map<number, number>();
  for (let i = 0; i < 3600; i++) {
    stepTraffic(state, world, 1 / 60, () => 0.25);
    for (const w of state.warnings) if (!firstWarning.has(w.id)) firstWarning.set(w.id, state.clock);
    for (const v of state.vehicles) if (!seen.has(v.id)) {
      seen.add(v.id);
      assert.ok(state.clock - firstWarning.get(v.id)! >= 1.8 - 1e-8);
      const b = vehicleBounds(v, world);
      assert.ok(v.dir > 0 ? b.x + b.w <= 0 : b.x >= world.w);
    }
    assert.ok(state.vehicles.length <= 2);
    assert.ok(state.warnings.length <= 2);
  }
  assert.ok(seen.size > 12);
});

for (const kind of ["sedan", "suv", "truck", "taxi", "van", "bus", "semi"] as const) for (const dir of [-1, 1] as const) for (const lane of ["ground", "bridge"] as const) {
  test(`${kind} ${lane} direction ${dir}: solid side hit throws the ball upward and with traffic`, () => {
    const state = createTraffic(), v = car(kind, dir, lane);
    state.vehicles = [v];
    const bounds = vehicleBounds(v, world);
    // Leave room for each sprite's transparent bumper margin (bus uses 3%).
    const ball = ballAt(v.x + dir * (bounds.w / 2 + 10), bounds.bottom - 20);
    assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), true);
    assert.ok(ball.vx * dir >= 495);
    assert.ok(ball.vy < -300);
    assert.equal(state.launched, true);
    assert.ok([ball.x, ball.y, ball.vx, ball.vy].every(Number.isFinite));
  });
}

test("truck roof is higher than SUV, which is higher than a sedan", () => {
  assert.ok(vehicleSize("truck", world).h > vehicleSize("suv", world).h);
  assert.ok(vehicleSize("suv", world).h > vehicleSize("sedan", world).h);
  for (const kind of ["sedan", "suv", "truck"] as const) {
    const state = createTraffic(), v = car(kind, 1, "bridge");
    v.prevX = v.x;
    state.vehicles = [v];
    const b = vehicleBounds(v, world);
    const ball = ballAt(v.x, b.y + 25);
    ball.vy = 4000;
    assert.ok(collideTraffic(state, world, ball, v.x, b.y - 50));
    assert.ok(ball.vy < 0);
  }
});

test("swept collision catches a vehicle crossing the whole ball in one frame", () => {
  const state = createTraffic(), v = car("sedan", 1);
  v.prevX = 40; v.x = 350;
  state.vehicles = [v];
  const ball = ballAt(195, world.floorY - 19.5);
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y));
  assert.ok(ball.vx > 0);
});

test("bridge has no collider and both traffic planes remain independent", () => {
  const state = createTraffic();
  const ball = ballAt(195, bridgeY(world) + 20);
  ball.vy = 500;
  assert.equal(collideTraffic(state, world, ball, 195, bridgeY(world) - 20), false);
  state.vehicles = [car("truck", 1, "ground")];
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), false);
  state.vehicles = [car("truck", 1, "bridge")];
  ball.y = world.floorY - ball.r;
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), false);
});

test("only a bumper hit arms immunity; roof and tail contacts do not", () => {
  const front = createTraffic(), v = car("sedan", 1);
  front.vehicles = [v];
  const b = vehicleBounds(v, world);
  const ahead = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  assert.ok(collideTraffic(front, world, ahead, ahead.x, ahead.y));
  assert.equal(front.launched, true);

  const tail = createTraffic(), t = car("sedan", 1);
  t.prevX = t.x;
  tail.vehicles = [t];
  const behind = ballAt(t.x - b.w / 2 - 15, b.bottom - 20);
  behind.vx = 600;
  assert.ok(collideTraffic(tail, world, behind, behind.x - 20, behind.y));
  assert.equal(tail.launched, false);

  const roof = createTraffic(), r = car("sedan", 1);
  r.prevX = r.x;
  roof.vehicles = [r];
  const top = ballAt(r.x, b.y + 25);
  top.vy = 4000;
  assert.ok(collideTraffic(roof, world, top, r.x, b.y - 50));
  assert.equal(roof.launched, false);
});

test("a bumper launch out of any edge keeps the ball where it is and grants five seconds of immunity", () => {
  const state = createTraffic();
  const ball = ballAt(195, 200);
  for (const [x, y] of [[-30, 200], [420, 200], [195, -30], [195, 900]]) {
    ball.x = x!; ball.y = y!; ball.vx = 700;
    state.launched = true;
    assert.ok(trafficOutOfBounds(state, world, ball));
    grantTrafficSafe(state, ball);
    assert.equal(ball.x, x);
    assert.equal(ball.y, y);
    assert.equal(ball.vx, 700);
    assert.equal(ball.trafficSafe, true);
    assert.equal(state.safeLeft, 5);
    assert.equal(state.launched, false);
    state.vehicles = [car("truck", 1)];
    assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), false);
  }
  for (let i = 0; i < 299; i++) stepTraffic(state, world, 1 / 60);
  assert.ok(state.safeLeft > 0);
  stepTraffic(state, world, 1 / 60);
  assert.ok(state.safeLeft < 1e-10);
  stepTraffic(state, world, 1 / 60);
  const truck = car("truck", 1);
  state.vehicles = [truck];
  const tb = vehicleBounds(truck, world);
  ball.x = truck.x + tb.w / 2 + 15; ball.y = tb.bottom - 20;
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y));
});

for (const dir of [-1, 1] as const) {
  test(`awakened hacker slides along roof without knockback, direction ${dir}`, () => {
    const state = createTraffic(), v = car("truck", dir, "bridge");
    v.prevX = v.x;
    state.vehicles = [v];
    const b = vehicleBounds(v, world);
    const x = b.x + b.w * (dir > 0 ? 0.3 : 0.7);
    const ball = ballAt(x, b.y - ballAt(0, 0).r + 2);
    ball.vy = 600;
    assert.ok(collideTraffic(state, world, ball, x, ball.y - 10, { hacker: { x: dir, y: 0, speed: 450 } }));
    assert.equal(ball.vx, dir * 450);
    assert.equal(Math.abs(ball.vy), 0);
    assert.equal(state.launched, false);
    assert.equal(state.hitLock, 0);
  });
}

for (const dir of [-1, 1] as const) for (const edge of ["roof", "side", "corner"] as const) {
  test(`hacker ${edge} traversal continues across frames, vehicle direction ${dir}`, () => {
    const state = createTraffic(), v = car("truck", dir, "bridge");
    v.speed = 0; v.prevX = v.x; state.vehicles = [v];
    const b = vehicleBounds(v, world);
    const left = b.x + (dir > 0 ? 0.02 : 0.34) * b.w;
    const right = left + 0.64 * b.w;
    const desired = { x: 0, y: 1, speed: 120 };
    const ball = edge === "roof" ? ballAt((left + right) / 2, b.y - 19)
      : edge === "side" ? ballAt(left - 19, b.y + 25)
      : ballAt(left - 13.5, b.y - 13.5);
    if (edge === "side") { desired.x = 1; desired.y = 0; }
    ball.vx = desired.x * desired.speed; ball.vy = desired.y * desired.speed;
    const start = { x: ball.x, y: ball.y };
    let contacts = 0;
    for (let i = 0; i < 15; i++) {
      // Mirrors engine: intended velocity, persistent slide update, integrate, collide.
      ball.vx = desired.x * desired.speed; ball.vy = desired.y * desired.speed;
      updateTrafficHackerSlide(state, world, ball, desired);
      const px = ball.x, py = ball.y;
      ball.x += ball.vx / 60; ball.y += ball.vy / 60;
      if (collideTraffic(state, world, ball, px, py, { dt: 1 / 60, hacker: desired })) contacts++;
      assert.ok(trafficClearance(v, world, ball) >= -1.5, "ball must not cut through the car");
      assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - desired.speed) < 1e-6);
      assert.equal(state.launched, false);
    }
    assert.ok(Math.hypot(ball.x - start.x, ball.y - start.y) > 12, "must progress, not pin to t=0 contact");
    assert.ok(contacts > 3, "must remain against the edge over multiple steps");
    updateTrafficHackerSlide(state, world, ball, { x: 0, y: -1, speed: 120 });
    if (edge === "roof") assert.equal(state.hackerSlide, undefined, "outward input releases edge");
  });
}

test("quantum tunnel ignores vehicles entirely and cannot earn near misses", () => {
  const state = createTraffic();
  state.vehicles = [car("truck", 1)];
  const ball = ballAt(190, world.floorY - 20);
  const before = { ...ball };
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y, { tunneling: true, frost: { chance: 1, first: 4, refresh: 3 } }), false);
  assert.deepEqual(ball, before);
  assert.equal(state.vehicles[0]!.frozenLeft, undefined);
  stepTrafficNearMiss(state, world, ball, true);
  ball.y = 100;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0);
});

test("lightning roof friction uses vehicle-relative speed and maintains continuous contact", () => {
  const state = createTraffic(), v = car("truck", 1, "bridge");
  v.prevX = v.x;
  state.vehicles = [v];
  const b = vehicleBounds(v, world), ball = ballAt(b.x + b.w * 0.3, b.y - 19.5 + 1);
  ball.vx = 0; ball.vy = 120;
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y - 5, { lightning: true, dt: 1 / 60 }));
  assert.equal(state.roofSpeed, 300);
  assert.ok(ball.vx > 0 && ball.vx < 300);
  assert.equal(ball.vy, 0);
  assert.equal(state.launched, false);
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y, { lightning: true, dt: 1 / 60 }));
  assert.ok(state.roofSpeed > 0);
});

test("frost chance, matching 4/3s durations and separated-contact bonus debounce", () => {
  const state = createTraffic(), v = car("sedan", 1);
  v.prevX = v.x;
  state.vehicles = [v];
  const b = vehicleBounds(v, world);
  const frost = { chance: 0.4, first: 4, refresh: 3 };
  const touch = (random: number) => {
    const ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
    collideTraffic(state, world, ball, ball.x, ball.y, { frost, random: () => random });
  };
  touch(0.4);
  assert.equal(v.frozenLeft, undefined);
  state.clock += 0.31; state.hitLock = 0;
  touch(0.39);
  assert.equal(v.frozenLeft, 4);
  assert.equal(state.frostGain, 0);
  for (let i = 0; i < 30; i++) { state.clock += 1 / 60; touch(0); assert.equal(state.frostGain, 0); }
  assert.equal(v.frozenLeft, 4);
  state.clock += 0.31; state.hitLock = 0;
  touch(0);
  assert.equal(state.frostGain, 1);
  assert.equal(v.frozenLeft, 3);
});

test("frozen cars move at 20%, thaw at normal speed, and block new cars in their lane", () => {
  const state = createTraffic(), v = car("truck", 1);
  v.x = 100; v.frozenLeft = 0.5;
  state.vehicles = [v];
  stepTraffic(state, world, 0.25, () => 0);
  assert.equal(v.x, 115);
  assert.equal(v.frozenLeft, 0.25);
  assert.ok(!state.warnings.some(w => w.lane === "ground"));
  stepTraffic(state, world, 0.5, () => 0);
  assert.equal(v.x, 205);
  assert.equal(v.frozenLeft, 0);
});

test("near miss requires close then clear, awards once per car and collision clears pending reward", () => {
  const state = createTraffic(), v = car("truck", 1, "bridge");
  v.prevX = v.x;
  state.vehicles = [v];
  const b = vehicleBounds(v, world), ball = ballAt(b.x + b.w * 0.3, b.y - 19.5 - 3);
  assert.ok(trafficClearance(v, world, ball) > 0);
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0);
  ball.y -= 40;
  stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 1);
  ball.y += 40; stepTrafficNearMiss(state, world, ball);
  ball.y -= 40; stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 1);
  const other = { ...v, id: 2 };
  state.vehicles = [other];
  ball.y += 40; stepTrafficNearMiss(state, world, ball);
  ball.y -= 40; stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 2);
  ball.y = b.y - 19.5 + 3;
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y - 10));
  assert.equal(state.nearMiss, 0);
  ball.y -= 100; stepTrafficNearMiss(state, world, ball);
  assert.equal(state.nearMiss, 0);
});

test("blaze ball torches a car: no knockback, +5 score, debris is not solid and clears", () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v];
  state.nearMiss = 3;
  const b = vehicleBounds(v, world);
  const ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  ball.vx = -200; ball.vy = -50;
  const before = { ...ball };
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true }), false);
  assert.deepEqual(ball, before);
  assert.equal(state.burnScore, 5);
  assert.equal(v.burnt, 0);
  assert.equal(state.launched, false);
  assert.equal(state.nearMiss, 0);
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true }), false);
  assert.equal(state.burnScore, 0);
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), false);
  const x = v.x;
  stepTraffic(state, world, 0.2, () => 0.99);
  assert.equal(v.x, x);
  assert.ok(state.vehicles.includes(v));
  assert.ok(!state.warnings.some(w => w.lane === "ground"));
  stepTraffic(state, world, TRAFFIC_BURN_SECONDS, () => 0.99);
  assert.ok(!state.vehicles.includes(v));
});

test("without blaze the same contact still knocks the ball away", () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v];
  const b = vehicleBounds(v, world);
  const ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  assert.ok(collideTraffic(state, world, ball, ball.x, ball.y, { blaze: false }));
  assert.equal(v.burnt, undefined);
  assert.equal(state.burnScore, 0);
});

test("blaze ball torches a car: no knockback, +5 once, car stops and is removed after shattering", () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v];
  state.nearMiss = 3;
  const b = vehicleBounds(v, world);
  const ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  ball.vx = -120; ball.vy = -40;
  const before = { ...ball };
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true }), false);
  assert.deepEqual(ball, before);
  assert.equal(state.burnScore, 5);
  assert.equal(v.burnt, 0);
  assert.equal(state.launched, false);
  assert.equal(state.nearMiss, 0);
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true }), false);
  assert.equal(state.burnScore, 0);
  assert.equal(collideTraffic(state, world, ball, ball.x, ball.y), false);
  const x = v.x;
  stepTraffic(state, world, 0.3, () => 0.99);
  assert.equal(v.x, x);
  assert.ok(state.vehicles.includes(v));
  assert.ok(v.burnLaunch && v.burnLaunch.vy < 0);
  stepTraffic(state, world, TRAFFIC_BURN_SECONDS, () => 0.99);
  assert.ok(!state.vehicles.includes(v));
});

const touchCar = (state: ReturnType<typeof createTraffic>, v: Vehicle, skills: Parameters<typeof collideTraffic>[5] = {}) => {
  const b = vehicleBounds(v, world);
  const ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  collideTraffic(state, world, ball, ball.x, ball.y, skills);
  return ball;
};

test("ignite burns on first contact, upgrades only after physically separating, then blaze launches", () => {
  const state = createTraffic(), v = car("truck", 1);
  v.prevX = v.x; state.vehicles = [v];
  touchCar(state, v, { ignite: true });
  assert.equal(v.burning, true);
  assert.equal(v.burnt, undefined);
  assert.equal(state.igniteUpgrade, false);
  for (let i = 0; i < 90; i++) {
    state.clock += 1 / 60;
    touchCar(state, v, { ignite: true });
    assert.equal(state.igniteUpgrade, false, "continuous contact must not upgrade");
  }
  state.clock += 0.29;
  touchCar(state, v, { ignite: true });
  assert.equal(state.igniteUpgrade, false);
  state.clock += 0.301; state.hitLock = 0;
  touchCar(state, v, { ignite: true });
  assert.equal(state.igniteUpgrade, false, "elapsed time alone cannot rearm fire");
  const away = ballAt(0, 0);
  collideTraffic(state, world, away, 0, 0, { ignite: true });
  touchCar(state, v, { ignite: true });
  assert.equal(state.igniteUpgrade, true);
  const b = vehicleBounds(v, world), ball = ballAt(v.x + b.w / 2 + 15, b.bottom - 20);
  ball.vx = -160; ball.vy = 40;
  const before = { ...ball };
  collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true });
  assert.deepEqual(ball, before);
  assert.equal(state.igniteUpgrade, false);
  assert.equal(v.burning, false);
  assert.equal(v.burnt, 0);
  assert.ok(v.burnLaunch && v.burnLaunch.vy < 0 && v.burnLaunch.vx < 0);
  assert.equal(state.burnScore, 5);
});

test("ordinary contact and ignored skill contact do not ignite or leave stale event flags", () => {
  const state = createTraffic(), v = car("sedan", 1);
  state.vehicles = [v];
  touchCar(state, v);
  assert.equal(v.burning, undefined);
  state.igniteUpgrade = true; state.lightningHit = true;
  touchCar(state, v, { ignite: true, discharge: true, tunneling: true });
  assert.equal(state.igniteUpgrade, false);
  assert.equal(state.lightningHit, false);
  assert.equal(v.burning, undefined);
});

test("discharge rewards one fresh contact, respects hitLock and cannot farm sustained roof friction", () => {
  const state = createTraffic(), v = car("truck", 1, "bridge");
  v.speed = 0; v.prevX = v.x; state.vehicles = [v];
  const b = vehicleBounds(v, world);
  const roofTouch = (discharge: boolean) => {
    const ball = ballAt(b.x + b.w * 0.3, b.y - 19);
    collideTraffic(state, world, ball, ball.x, ball.y - 2, { lightning: true, discharge, dt: 1 / 60 });
  };
  roofTouch(true);
  assert.equal(state.lightningHit, true);
  assert.equal(state.hitLock, 0.18);
  for (let i = 0; i < 90; i++) {
    stepTraffic(state, world, 1 / 60, () => 0.99);
    roofTouch(true);
    assert.equal(state.lightningHit, false);
  }
  state.clock += 0.31; state.hitLock = 0.05;
  roofTouch(true);
  assert.equal(state.lightningHit, false, "fresh contact is still gated by hitLock");
  state.clock += 0.31; state.hitLock = 0;
  roofTouch(false);
  assert.equal(state.lightningHit, false, "below discharge threshold never awards");
  state.clock += 0.31;
  roofTouch(true);
  assert.equal(state.lightningHit, true);
  state.safeLeft = 1;
  roofTouch(true);
  assert.equal(state.lightningHit, false);
});

test("black hole captures all cars immediately, advances fixed timers, absorbs new arrivals and clears", () => {
  const state = createTraffic();
  const ground = car("truck", 1), bridge = { ...car("sedan", -1, "bridge"), id: 2 };
  bridge.burnt = 0.1; bridge.burnLaunch = { vx: -100, vy: -300 };
  state.vehicles = [ground, bridge];
  state.hackerSlide = { id: 1, turn: 1 };
  state.encounters[1] = { close: true, awarded: false, blocked: false };
  state.nearMiss = 2;
  beginTrafficAbsorption(state, 120, 150);
  assert.equal(state.hackerSlide, undefined);
  for (const v of state.vehicles) {
    assert.ok(v.absorbed);
    assert.equal(v.absorbed.targetX, 120);
    assert.equal(v.absorbed.targetY, 150);
    touchCar(state, v, { blaze: true, ignite: true, discharge: true });
    assert.equal(state.burnScore, 0);
    assert.equal(state.igniteUpgrade, false);
    assert.equal(state.lightningHit, false);
  }
  assert.equal(bridge.absorbed!.x, bridge.x - 10);
  assert.equal(bridge.absorbed!.y, -25.5);
  stepTrafficNearMiss(state, world, ballAt(0, 0));
  assert.equal(state.nearMiss, 2);
  state.warnings.push({ id: 3, kind: "suv", lane: "ground", dir: 1, speed: 100, tint: 0, left: 0.1 });
  const startX = ground.x;
  stepTraffic(state, world, 0.2, () => 0.99);
  assert.equal(ground.x, startX);
  assert.equal(ground.absorbed!.elapsed, 0.2);
  const captured = ground.absorbed;
  beginTrafficAbsorption(state, 120, 150);
  assert.equal(ground.absorbed, captured, "repeated calls must not restart the shrink timer");
  const incoming = state.vehicles.find(v => v.id === 3)!;
  assert.ok(incoming.absorbed, "newly spawned car is captured before collision");
  stepTraffic(state, world, TRAFFIC_ABSORB_SECONDS - 0.2 + 1e-8, () => 0.99);
  assert.ok(!state.vehicles.includes(ground));
  assert.ok(!state.vehicles.includes(bridge));
  assert.ok(state.vehicles.includes(incoming));
  stepTraffic(state, world, 0.2, () => 0.99);
  assert.ok(state.vehicles.includes(incoming), "arrival first enters at full size");
  assert.equal(incoming.absorbed!.elapsed, 0);
  for (let i = 0; i < 180; i++) stepTraffic(state, world, 1 / 60, () => 0.99);
  assert.ok(!state.vehicles.includes(incoming));
});

for (const direction of [-1, 1]) test(`blaze launch follows incoming ball direction ${direction}, not traffic`, () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v]; v.prevX = v.x;
  const b = vehicleBounds(v, world);
  const ball = ballAt(v.x - direction * (b.w / 2 + 15), b.bottom - 20);
  ball.vx = direction * 300; ball.vy = -80;
  collideTraffic(state, world, ball, ball.x, ball.y, { blaze: true });
  assert.ok(v.burnLaunch);
  assert.equal(Math.sign(v.burnLaunch.vx), direction);
  assert.equal(ball.vx, direction * 300);
  assert.equal(state.burnScore, 5);
});


test("speed stays bounded and fast-car probability rises with active play time", () => {
  const counts = [0, 90, 180].map(time => {
    let fast = 0;
    for (let i = 0; i < 1000; i++) {
      const speed = trafficSpeed(world.w, time, i / 999);
      assert.ok(speed >= world.w * 0.32 && speed <= world.w * 1.3);
      if (speed > world.w * 0.9) fast++;
    }
    return fast;
  });
  assert.ok(counts[0]! < counts[1]! && counts[1]! < counts[2]!);
});

test("a later rear collision cancels old front-launch eligibility", () => {
  const state = createTraffic(), v = car("truck", 1);
  state.vehicles = [v];
  touchCar(state, v);
  assert.equal(state.launched, true);
  state.hitLock = 0;
  const b = vehicleBounds(v, world), rear = ballAt(b.x - 15, b.bottom - 20);
  rear.vx = 500;
  collideTraffic(state, world, rear, rear.x, rear.y);
  assert.equal(state.launched, false);
  rear.x = world.w + 100;
  assert.equal(trafficOutOfBounds(state, world, rear), false);
});
