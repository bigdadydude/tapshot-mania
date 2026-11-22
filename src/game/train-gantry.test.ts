import assert from "node:assert/strict";
import test from "node:test";
import {
  getTrainGantries,
  getTrainGantryWarnings,
  resetTrainGantries,
  sweepGantryCircle,
  collideTrainGantries,
  createGantryDodgeWatch,
  noteGantryDodgeHit,
  resetGantryDodgeWatch,
  stepGantryDodgeWatch,
  type GantryRect,
} from "./train-gantry.ts";
const world = { w: 390, h: 844, floorY: 844 * 0.765 };
const route = { near: 1500, started: true, stationAt: 0, nextStationAt: 28080 };
const box: GantryRect = { x: 100, y: 200, w: 200, h: 16, kind: "beam" };

test("height stays within the requested band and remains stable across frames", () => {
  resetTrainGantries();
  const heights = [];
  for (let i = 0; i < 30; i++) {
    const r = { ...route, near: 1500 + i * 2400 };
    const g = getTrainGantries(world, r).find((g) => g.id === i);
    if (!g) continue;
    assert.ok(g.y >= world.h / 2 && g.y + 18 <= world.floorY);
    assert.equal(
      getTrainGantries(world, { ...r, near: r.near + 1 }).find(
        (n) => n.id === i,
      )!.y,
      g.y,
    );
    heights.push(g.y);
  }
  assert.ok(new Set(heights).size > 20);
  assert.deepEqual(getTrainGantries(world, { ...route, started: false }), []);
});

test("station clear zones keep gantries off the stopping platform", () => {
  assert.deepEqual(
    getTrainGantries(world, { ...route, near: 1600, stationAt: 1600 }),
    [],
  );
  assert.deepEqual(
    getTrainGantries(world, { ...route, near: 1500, nextStationAt: 1600 }),
    [],
  );
});

test("fast circle cannot tunnel through beam from either side", () => {
  const down = sweepGantryCircle(150, 100, 0, 300, 10, box)!;
  assert.ok(down);
  assert.equal(down.ny, -1);
  assert.ok(Math.abs(down.t - 0.3) < 1e-9);
  const up = sweepGantryCircle(150, 300, 0, -300, 10, box)!;
  assert.ok(up);
  assert.equal(up.ny, 1);
  assert.equal(sweepGantryCircle(50, 100, 0, 300, 10, box), null);
});

test("rounded corner collision does not block empty space in an expanded AABB", () => {
  assert.equal(sweepGantryCircle(90, 190, 0, 0, 10, box), null);
  const corner = sweepGantryCircle(80, 180, 30, 30, 10, box)!;
  assert.ok(corner && corner.nx < 0 && corner.ny < 0);
  const inside = sweepGantryCircle(150, 208, 0, 0, 10, box)!;
  assert.ok(inside.depth > 0);
});

test("moving mast strikes a stationary ball and adds its relative velocity", () => {
  const r = { ...route, near: 1550 };
  const g = getTrainGantries(world, r)[0]!;
  const mast = g.rects.find((r) => r.kind === "mast")!;
  const ball = { x: mast.x - 20, y: g.y + 100, vx: 0, vy: 0, r: 12 };
  const prevX = ball.x;
  ball.x += 0;
  // Mast was 50 px further right and has just swept through this ball.
  const r2 = { ...r, near: 1600 };
  assert.ok(collideTrainGantries(world, r2, ball, prevX, ball.y, 50, 0.1));
  assert.ok(ball.vx < -500);
  assert.ok(ball.x < mast.x - 50);
});

test("open center is not a solid rectangle, beam and signal cases do collide", () => {
  const g = getTrainGantries(world, route)[0]!;
  const ball = { x: g.x + 10, y: g.y + 100, vx: 0, vy: 0, r: 10 };
  assert.equal(
    collideTrainGantries(world, route, ball, ball.x, ball.y, 0, 1 / 60),
    false,
  );
  const beamBall = {
    x: g.x + g.width / 2,
    y: g.y + 60,
    vx: 0,
    vy: 1000,
    r: 10,
  };
  assert.ok(
    collideTrainGantries(world, route, beamBall, beamBall.x, g.y - 80, 0, 0.14),
  );
  assert.ok(beamBall.vy < 0);
  const lamp = g.rects.find((r) => r.kind === "signal")!;
  assert.ok(
    sweepGantryCircle(lamp.x + lamp.w / 2, lamp.y - 50, 0, 90, 10, lamp),
  );
});

test("side elevation is narrow, has one support, and suspends the light below the beam", () => {
  const g = getTrainGantries(world, route)[0]!;
  assert.ok(g.width < world.w * 0.2);
  assert.equal(g.rects.filter((r) => r.kind === "mast").length, 1);
  const beam = g.rects.find((r) => r.kind === "beam")!;
  const lamp = g.rects.find((r) => r.kind === "signal")!;
  assert.ok(lamp.y >= beam.y + beam.h);
  const b = { x: g.x + 150, y: g.y + 5, vx: 0, vy: 0, r: 10 };
  assert.equal(
    collideTrainGantries(world, route, b, b.x, b.y, 0, 1 / 60),
    false,
  );
});

test("edge warning precedes entry, blinks on simulation time, and clears on entry or stop", () => {
  const ahead = { ...route, near: 800, trainSpeed: 540, elapsed: 0 };
  const lit = getTrainGantryWarnings(world, ahead);
  assert.equal(lit.length, 1);
  assert.equal(lit[0]!.lit, true);
  assert.equal(
    getTrainGantryWarnings(world, { ...ahead, elapsed: 0.2 })[0]!.lit,
    false,
  );
  assert.equal(
    getTrainGantryWarnings(world, { ...ahead, elapsed: 0.4 })[0]!.lit,
    true,
  );
  assert.deepEqual(getTrainGantryWarnings(world, { ...ahead, near: 1210 }), []);
  assert.deepEqual(
    getTrainGantryWarnings(world, { ...ahead, trainSpeed: 0 }),
    [],
  );
  assert.deepEqual(
    getTrainGantryWarnings(world, { ...ahead, started: false }),
    [],
  );
  assert.deepEqual(getTrainGantryWarnings(world, { ...ahead, near: 0 }), []);
});

test("gantry dodge: on-screen then fully left without a hit counts once", () => {
  const watch = createGantryDodgeWatch();
  const g = { id: 7, x: 100, width: 48 };
  assert.equal(stepGantryDodgeWatch(watch, 390, [g]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: -10 }]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: -48 }]), 1);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: -80 }]), 0);
});

test("gantry dodge: a real hit then leaving left is not a dodge", () => {
  const watch = createGantryDodgeWatch();
  const g = { id: 3, x: 80, width: 48 };
  stepGantryDodgeWatch(watch, 390, [g]);
  noteGantryDodgeHit(watch, 3);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: -48 }]), 0);
});

test("gantry dodge: still on screen is not awarded", () => {
  const watch = createGantryDodgeWatch();
  const g = { id: 1, x: 200, width: 48 };
  assert.equal(stepGantryDodgeWatch(watch, 390, [g]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: 20 }]), 0);
});

test("gantry dodge: warning-zone only, never on screen, is not awarded", () => {
  const watch = createGantryDodgeWatch();
  const g = { id: 9, x: 400, width: 48 };
  assert.equal(stepGantryDodgeWatch(watch, 390, [g]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, []), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ ...g, x: -48 }]), 0);
});

test("gantry dodge: tunnelBlocked wipe is not a dodge", () => {
  const watch = createGantryDodgeWatch();
  const g = { id: 4, x: 120, width: 48 };
  assert.equal(stepGantryDodgeWatch(watch, 390, [g]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [], { tunnelBlocked: true }), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [g]), 0);
});

test("collideTrainGantries reports the struck gantry id, but a block is not a hit", () => {
  resetTrainGantries();
  const r = { ...route, near: 1550 };
  const g = getTrainGantries(world, r)[0]!;
  const mast = g.rects.find((rect) => rect.kind === "mast")!;
  const ball = { x: mast.x - 20, y: g.y + 100, vx: 0, vy: 0, r: 12 };
  const prevX = ball.x;
  const r2 = { ...r, near: 1600 };
  const hitOut: { id?: number } = {};
  assert.equal(collideTrainGantries(world, r2, { ...ball }, prevX, ball.y, 50, 0.1, undefined, hitOut), true);
  assert.equal(hitOut.id, g.id);
  const blocked: { id?: number } = {};
  const blockedBall = { x: mast.x - 20, y: g.y + 100, vx: 0, vy: 0, r: 12 };
  assert.equal(
    collideTrainGantries(world, r2, blockedBall, prevX, blockedBall.y, 50, 0.1, () => true, blocked),
    false,
  );
  assert.equal(blocked.id, undefined);
});

test("resetGantryDodgeWatch clears seen gantries so a later pass can count again", () => {
  const watch = createGantryDodgeWatch();
  stepGantryDodgeWatch(watch, 390, [{ id: 2, x: 40, width: 48 }]);
  stepGantryDodgeWatch(watch, 390, [{ id: 2, x: -48, width: 48 }]);
  resetGantryDodgeWatch(watch);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ id: 2, x: 40, width: 48 }]), 0);
  assert.equal(stepGantryDodgeWatch(watch, 390, [{ id: 2, x: -48, width: 48 }]), 1);
});

