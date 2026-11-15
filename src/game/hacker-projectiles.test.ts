import { test } from "node:test";
import assert from "node:assert/strict";
import { hackerDropProjectile, sweptCircleContact } from "./hacker-projectiles.ts";

for (const elite of [false, true]) test(`${elite ? "elite" : "ordinary"} projectile crossing drops once without knocking the ball`, () => {
  const projectile = { x: 300, y: 100, vx: 1200, vy: 0, r: elite ? 5.2 : 4, elite, falling: false, fadeLeft: null };
  const ball = { x: 150, y: 100, r: 20, vx: 15, vy: 800, omega: 2, squash: 1 };
  const original = { ...ball };
  let rewards = 0;
  const reward = () => { rewards++; };
  assert.equal(hackerDropProjectile(projectile, { x: 0, y: 100 }, ball, ball, reward), true);
  assert.equal(projectile.falling, true);
  assert.equal(projectile.vx, 0); assert.equal(projectile.vy, 0);
  assert.deepEqual(ball, original);
  assert.equal(hackerDropProjectile(projectile, { x: 0, y: 100 }, ball, ball, reward), false);
  assert.equal(rewards, 1);
  // Even a suction state change cannot turn this round into a second reward.
  projectile.falling = false;
  assert.equal(hackerDropProjectile(projectile, { x: 0, y: 100 }, ball, ball, reward), false);
  assert.equal(rewards, 1);
});

test("relative sweep detects a fast ball through a stationary projectile and initial overlap", () => {
  assert.equal(sweptCircleContact({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 0 }, 20), true);
  assert.equal(sweptCircleContact({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 20), true);
  // Parallel motion is not a collision just because spatial paths overlap.
  assert.equal(sweptCircleContact({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 100, y: 0 }, { x: 400, y: 0 }, 20), false);
});

test("falling, retired, consumed and missed projectiles do not reward", () => {
  for (const patch of [{ falling: true }, { fadeLeft: 0.4 }, { x: -9999 }, { y: 200 }]) {
    const projectile = { x: 100, y: 100, vx: 1200, vy: 0, r: 4, falling: false, fadeLeft: null as number | null, ...patch };
    let rewards = 0;
    assert.equal(hackerDropProjectile(projectile, projectile, { x: 100, y: 100, r: 20 }, { x: 100, y: 100 }, () => { rewards++; }), false);
    assert.equal(rewards, 0);
  }
});
