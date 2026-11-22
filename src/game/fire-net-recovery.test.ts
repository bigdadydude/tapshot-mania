import test from "node:test";
import assert from "node:assert/strict";
import { buildNet, collapseNet } from "./net.ts";
import { recoverFireNetSpeed, stepNet2, tugNet2, NET2_PROFILE, NET3_PROFILE, type NetProfile } from "./net2.ts";
import type { Ball, Hoop, World } from "./types";

const energy = (b: Ball) => b.vx ** 2 + b.vy ** 2 + 2 / 3 * b.r ** 2 * b.omega ** 2;
const angle = (b: Ball) => Math.atan2(b.vx, b.vy) * 180 / Math.PI;
const world = { h: 800 } as World;
const settled = new Map<NetProfile, Hoop>();
function fixture(profile: NetProfile) {
  if (!settled.has(profile)) {
    const h = { x: 200, y: 200, inner: 28, netPulse: 0, char: 0, burning: false, net: [] } as unknown as Hoop;
    h.net = buildNet(h);
    const far = { x: 900, y: 40, vx: 0, vy: 0, r: 19, omega: 0 } as Ball;
    for (let i = 0; i < 240; i++) stepNet2(h, far, far.x, far.y, world, 1 / 120, i / 120, false, { wind: 0, profile });
    settled.set(profile, h);
  }
  return structuredClone(settled.get(profile)!);
}

type Shot = { profile: NetProfile; dt: number; braking: number; fire?: boolean; burn?: boolean; ratio?: number; offset?: number; vy?: number; upward?: boolean };
function shoot({ profile, dt, braking, fire, burn = false, ratio = .48, offset = 0, vy = 500, upward = false }: Shot) {
  const h = fixture(profile);
  const b = { x: 200 + offset * 28, y: upward ? 280 : 199, vx: vy * ratio, vy: upward ? -vy : vy,
    r: 19, omega: 0, spin: 0, scored: false } as Ball;
  let exit: { angle: number; speed: number; vx: number; vy: number; time: number } | undefined;
  let catchRetention: number | undefined;
  for (let i = 0; i < Math.ceil(.6 / dt); i++) {
    const x = b.x, y = b.y;
    b.vy += 2500 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // Match the engine's shared scoring impulse and burning-start ordering.
    if (!upward && !b.scored && y <= h.y && b.y > h.y) {
      b.scored = true; b.vy += 70; tugNet2(h, b, profile); h.burning = burn;
    }
    const before = energy(b), beforeSpeed = Math.hypot(b.vx, b.vy);
    const hadCatch = h.net[0]!.netState?.impactApplied;
    stepNet2(h, b, x, y, world, dt, i * dt, true, { wind: 0, profile, brakingScale: braking, fireRecovery: fire });
    assert.ok(Number.isFinite(b.x + b.y + b.vx + b.vy + b.omega));
    assert.ok(energy(b) <= before + 1e-5, `net created energy: ${energy(b)} > ${before}`);
    const state = h.net[0]!.netState!;
    if (!hadCatch && state.impactApplied && catchRetention === undefined) catchRetention = Math.hypot(b.vx, b.vy) / beforeSpeed;
    if (state.exited && !exit) exit = { angle: angle(b), speed: Math.hypot(b.vx, b.vy), vx: b.vx, vy: b.vy, time: (i + 1) * dt };
    if (h.burning) { h.char = Math.min(1, h.char + dt / 1.05); collapseNet(h); }
  }
  return { exit, catchRetention, ball: b, hoop: h };
}

test("fire recovery spends only the target budget without changing a side rebound or forcing a direction", () => {
  for (const vx of [-80, 0, 80]) for (const vy of [-120, 0, 120]) for (const incomingVy of [-500, 0, 500]) {
    const b = { vx, vy }, target = Math.hypot(vx, vy) + 100;
    recoverFireNetSpeed(b, incomingVy, target);
    assert.equal(b.vx, vx, "no supplementary transverse impulse");
    assert.ok(Math.hypot(b.vx, b.vy) <= target + 1e-9);
    if (vy * incomingVy > 0) {
      assert.equal(Math.sign(b.vy), Math.sign(vy));
      assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - target) < 1e-9);
    } else assert.equal(b.vy, vy, "a reversed/stalled axis must not be restarted or forced down");
  }
  for (const target of [0, 10, NaN, Infinity]) {
    const b = { vx: -80, vy: 120 };
    recoverFireNetSpeed(b, 500, target);
    assert.deepEqual(b, { vx: -80, vy: 120 });
  }
});

test("net2/net3 actual oblique passages keep fire speed retention without magnifying the reflected exit", (t) => {
  const rows: object[] = [];
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) for (const dt of [1 / 60, 1 / 240]) for (const sign of [-1, 1]) {
    const opts = { profile, dt, ratio: .48 * sign };
    const normal = shoot({ ...opts, braking: 1 });
    const fire = shoot({ ...opts, braking: .65, fire: true });
    const blaze = shoot({ ...opts, braking: .35, fire: true, burn: true });
    const legacy = shoot({ ...opts, braking: .35, burn: true });
    for (const shot of [normal, fire, blaze, legacy]) assert.ok(shot.exit && shot.exit.vy > 0);
    assert.ok(fire.catchRetention! > normal.catchRetention!);
    assert.ok(blaze.catchRetention! > fire.catchRetention!);
    assert.ok(fire.exit!.speed > normal.exit!.speed);
    assert.ok(blaze.exit!.speed > fire.exit!.speed);
    assert.ok(blaze.exit!.vx * sign < 0, "the normal physical side rebound is not removed");
    assert.ok(Math.abs(blaze.exit!.angle) < Math.abs(legacy.exit!.angle) - 8);
    assert.ok(Math.abs(blaze.exit!.angle) <= Math.abs(normal.exit!.angle) + 4);
    if (sign === 1) rows.push({ profile: profile === NET2_PROFILE ? "net2" : "net3", dt, normal: normal.exit, fire: fire.exit, blaze: blaze.exit, legacy: legacy.exit });
  }
  t.diagnostic(JSON.stringify(rows));
});

test("center/offset entries, multiple angles and mirrors stay finite, symmetric and energy bounded", () => {
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) for (const dt of [1 / 60, 1 / 240]) {
    for (const [offset, ratio, vy] of [[0, 0, 500], [0, .15, 200], [0, .48, 500], [.2, .3, 500], [-.2, .8, 500], [0, .48, 1200]]) {
      for (const braking of [.65, .35]) for (const burn of [false, true]) {
        const opts = { profile, dt, offset, ratio, vy, braking, burn, fire: true };
        const a = shoot(opts), b = shoot({ ...opts, offset: -offset, ratio: -ratio });
        assert.ok(a.exit && b.exit, JSON.stringify({ offset, ratio, vy, dt }));
        // The staggered weave and 60Hz discrete contacts are not exact mirrors.
        assert.ok(Math.abs(a.exit.angle + b.exit.angle) < 3, `mirror angle: ${a.exit.angle}, ${b.exit.angle}`);
        assert.ok(Math.abs(a.exit.speed - b.exit.speed) / Math.max(a.exit.speed, b.exit.speed) < .08);
        if (!offset && !ratio) assert.ok(Math.abs(a.exit.angle) < 1, "no centered side kick");
        if (!burn) for (const sign of [-1, 1]) {
          const direction = { ...opts, offset: offset * sign, ratio: ratio * sign };
          const fixed = sign === 1 ? a : b;
          const normal = shoot({ ...direction, braking: 1 });
          const legacy = shoot({ ...direction, fire: false });
          assert.ok(normal.exit && legacy.exit);
          assert.ok(Math.abs(fixed.exit!.angle) <= Math.abs(legacy.exit.angle) + .2, "recovery must not magnify the reflected exit");
          assert.ok(Math.abs(fixed.exit!.angle) <= Math.abs(normal.exit.angle) + 4, "heated exit remains near the ordinary angle across entries");
        }
        if (burn) {
          const unburned = shoot({ ...opts, burn: false });
          assert.deepEqual(a.exit, unburned.exit, "fast exits precede released burning rows");
        }
      }
    }
  }
});

test("normal heat-free callers and upward side arrivals retain their exact trajectories", () => {
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) for (const dt of [1 / 60, 1 / 240]) for (const ratio of [-.48, 0, .48]) {
    const opts = { profile, dt, ratio, braking: 1 };
    assert.deepEqual(shoot(opts), shoot({ ...opts, fire: true }), "braking=1 cannot change any ball");
    const oldUp = shoot({ ...opts, upward: true, braking: .35 });
    const newUp = shoot({ ...opts, upward: true, braking: .35, fire: true });
    assert.deepEqual(newUp, oldUp, "upward sleeve contacts do not invoke downward-entry recovery");
  }
});
