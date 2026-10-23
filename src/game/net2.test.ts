import test from "node:test";
import assert from "node:assert/strict";
import { buildNet, nudgeNet, NET_COLS, RIM_RY, stepNet } from "./net.ts";
import { stepNet2, strikeNet2, tugNet2, NET2_EDGES, NET2_PROFILE, NET3_PROFILE, type NetProfile } from "./net2.ts";
import type { Ball, Hoop, World } from "./types";

function setup() {
  const hoop = { x: 200, y: 200, inner: 28, netPulse: 0, char: 0, burning: false, net: [] } as unknown as Hoop;
  hoop.net = buildNet(hoop);
  const ball = { x: 200, y: 100, vx: 0, vy: 300, r: 19, spin: 0, omega: 0,
    squash: 1, scored: false, hitRim: false, hitBoard: false } as Ball;
  return { hoop, ball, world: { h: 800 } as World };
}
function tick(s: ReturnType<typeof setup>, seconds: number, dt = 1 / 120) {
  for (let i = 0; i < Math.round(seconds / dt); i++)
    stepNet2(s.hoop, s.ball, s.ball.x, s.ball.y, s.world, dt, i * dt, false);
}
function center(s: ReturnType<typeof setup>) {
  const row = s.hoop.net.slice(-NET_COLS);
  return { x: row.reduce((sum, n) => sum + n.x, 0) / row.length,
    y: row.reduce((sum, n) => sum + n.y - n.depth! * RIM_RY, 0) / row.length };
}
function shoot(s: ReturnType<typeof setup>, offset = 0, dt = 1 / 120) {
  s.ball.x = s.hoop.x + offset;
  s.ball.y = s.hoop.y - 40;
  const restY = center(s).y;
  let excursion = 0;
  for (let i = 0; i < Math.round(0.4 / dt); i++) {
    const before = structuredClone(s.ball);
    s.ball.y += s.ball.vy * dt;
    s.ball.x += s.ball.vx * dt;
    const expected = structuredClone(s.ball);
    stepNet2(s.hoop, s.ball, before.x, before.y, s.world, dt, i * dt, true);
    assert.ok(Math.hypot(s.ball.vx, s.ball.vy) <= Math.hypot(expected.vx, expected.vy) + 1e-6, "friction cannot add energy");
    assert.equal(s.ball.scored, expected.scored, "cloth must not change scoring flags");
    assert.equal(s.ball.hitRim, expected.hitRim);
    excursion = Math.max(excursion, Math.abs(center(s).y - restY));
  }
  return excursion;
}

test("a make adds local momentum without snapping any node to a preset pose", () => {
  const s = setup(); tick(s, 1);
  s.ball.x += 12; s.ball.y = s.hoop.y + 14;
  const positions = s.hoop.net.map(n => [n.x, n.y]);
  tugNet2(s.hoop, s.ball);
  assert.deepEqual(s.hoop.net.map(n => [n.x, n.y]), positions);
  const near = s.hoop.net.filter(n => n.x > s.hoop.x && !n.pinned);
  const far = s.hoop.net.filter(n => n.x < s.hoop.x && !n.pinned);
  const motion = (nodes: typeof near) => nodes.reduce((v, n) => v + Math.abs(n.y - n.py), 0) / nodes.length;
  assert.ok(motion(near) > motion(far), "off-center make should pull the nearby side more");
});

test("ball deforms the hem, then the net settles while its rim stays pinned", () => {
  const s = setup(); tick(s, 2);
  const rimPoints = () => s.hoop.net.slice(0, NET_COLS).map(n => [n.x, n.y, n.depth]);
  const rest = center(s), rim = rimPoints();
  const excursion = shoot(s);
  assert.ok(excursion > 3, `expected visible cloth motion, got ${excursion}`);
  tick(s, 3);
  const settled = center(s);
  assert.ok(Math.abs(settled.y - rest.y) < 1.5, `hem failed to settle: ${settled.y - rest.y}`);
  assert.deepEqual(rimPoints(), rim);
  for (const n of s.hoop.net) assert.ok(Number.isFinite(n.x + n.y + n.depth!));
});

test("physics remains consistent across normal and special-ball substeps", () => {
  const normal = setup(), small = setup();
  tick(normal, 1, 1 / 60); tick(small, 1, 1 / 480);
  shoot(normal, 8, 1 / 60); shoot(small, 8, 1 / 480);
  const a = center(normal), b = center(small);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 4,
    `substep results diverged: ${JSON.stringify({ a, b })}`);
});

test("fast crossings still move the net; disabled contact does not", () => {
  const hit = setup(), off = setup(); tick(hit, 1); tick(off, 1);
  for (const s of [hit, off]) {
    s.ball.y = 290; s.ball.vy = 8000;
    stepNet2(s.hoop, s.ball, 200, 160, s.world, 1 / 60, 1, s === hit);
  }
  assert.ok(hit.hoop.net.some((n, i) => Math.hypot(n.x - off.hoop.net[i]!.x, n.y - off.hoop.net[i]!.y) > 2));
});

test("moving hoops and rewind snapshots preserve the cloth state", () => {
  const s = setup(); tick(s, 1); shoot(s, 10);
  const replay = structuredClone(s), moved = structuredClone(s);
  moved.hoop.x += 50; moved.hoop.y -= 30; nudgeNet(moved.hoop, 50, -30);
  tick(s, .3); tick(replay, .3); tick(moved, .3);
  assert.deepEqual(s.hoop.net, replay.hoop.net);
  for (let i = 0; i < s.hoop.net.length; i++) {
    assert.ok(Math.abs(moved.hoop.net[i]!.x - s.hoop.net[i]!.x - 50) < 1e-6);
    assert.ok(Math.abs(moved.hoop.net[i]!.y - s.hoop.net[i]!.y + 30) < 1e-6);
  }
});

test("burnt rows release; paused updates are inert", () => {
  const s = setup(); tick(s, 1);
  const before = structuredClone(s);
  stepNet2(s.hoop, s.ball, 200, 100, s.world, 0, 1, true);
  assert.deepEqual(s, before);
  s.hoop.char = 1; s.hoop.burning = true;
  tick(s, 1);
  assert.ok(s.hoop.net.every((n, i) => !n.pinned && Number.isFinite(n.y) && n.y > before.hoop.net[i]!.y + 25));
});

function advanceBall(s: ReturnType<typeof setup>, dt = 1 / 120) {
  const x = s.ball.x, y = s.ball.y;
  s.ball.vy += 900 * dt;
  s.ball.x += s.ball.vx * dt; s.ball.y += s.ball.vy * dt;
  stepNet2(s.hoop, s.ball, x, y, s.world, dt, 0, true, { wind: 0 });
}

function ropeDistance(s: ReturnType<typeof setup>) {
  let min = Infinity;
  for (const e of NET2_EDGES) {
    const a = s.hoop.net[e.a]!, b = s.hoop.net[e.b]!;
    const ax = a.x, ay = a.y - a.depth! * RIM_RY, az = a.depth!;
    const dx = b.x - ax, dy = b.y - b.depth! * RIM_RY - ay, dz = b.depth! - az;
    const t = Math.max(0, Math.min(1, ((s.ball.x - ax) * dx + (s.ball.y - ay) * dy - az * dz) / (dx * dx + dy * dy + dz * dz)));
    min = Math.min(min, Math.hypot(ax + dx * t - s.ball.x, ay + dy * t - s.ball.y, az + dz * t));
  }
  return min;
}

test("the sleeve wraps a descending ball through the hem without rope penetration", () => {
  for (const offset of [0, 8, -8]) {
    const s = setup(); tick(s, 1);
    s.ball.x += offset; s.ball.y = 180; s.ball.vy = 420; s.ball.vx = offset * 4;
    let occupied = false, exited = false, minDistance = Infinity, maxOpening = 0;
    for (let i = 0; i < 150; i++) {
      advanceBall(s);
      const state = s.hoop.net[0]!.netState!;
      if (state.inside) {
        occupied = true;
        if (s.ball.y > s.hoop.y + s.ball.r) minDistance = Math.min(minDistance, ropeDistance(s));
        const hem = s.hoop.net.slice(-NET_COLS);
        maxOpening = Math.max(maxOpening, Math.max(...hem.map(n => n.x)) - Math.min(...hem.map(n => n.x)));
      }
      if (occupied && !state.inside) {
        const hem = s.hoop.net.slice(-NET_COLS);
        assert.ok(s.ball.y - s.ball.r >= Math.max(...hem.map(n => n.y - n.depth! * RIM_RY)) - 1);
        exited = true; break;
      }
    }
    assert.ok(occupied && exited, "a made ball must release through the bottom without getting stuck");
    assert.ok(minDistance >= s.ball.r - .65, `rope cuts through ball by ${s.ball.r - minDistance}px`);
    assert.ok(maxOpening > s.ball.r * 1.85, "hem must open around the ball");
  }
});

test("a make stays in the sleeve and leaves through the hem", () => {
  const dt = 1 / 120;
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) {
    const label = profile === NET3_PROFILE ? "net3" : "net2";
    for (const [offset, vx] of [[0, 40], [8, 120], [-6, -90]] as const) {
      const s = settleCloth(profile);
      s.ball.x = s.hoop.x + offset;
      s.ball.y = s.hoop.y - 45;
      s.ball.vx = vx;
      s.ball.vy = 360;
      let occupied = false, exited = false, maxOff = 0;
      for (let i = 0; i < 220; i++) {
        const x = s.ball.x, y = s.ball.y;
        s.ball.vy += 900 * dt;
        s.ball.x += s.ball.vx * dt;
        s.ball.y += s.ball.vy * dt;
        stepNet2(s.hoop, s.ball, x, y, s.world, dt, i * dt, true, { wind: 0, profile });
        const state = s.hoop.net[0]!.netState!;
        if (state.inside) {
          occupied = true;
          if (s.ball.y > s.hoop.y + s.ball.r) maxOff = Math.max(maxOff, Math.abs(s.ball.x - s.hoop.x));
        } else if (occupied) {
          const hem = Math.max(...s.hoop.net.map(n => n.y));
          assert.ok(s.ball.y > hem - s.ball.r, `${label} offset ${offset} left the sleeve above the hem`);
          assert.ok(Math.abs(s.ball.x - s.hoop.x) <= s.hoop.inner * 0.3, `${label} offset ${offset} exited the side at x ${s.ball.x}`);
          exited = true;
          break;
        }
      }
      assert.ok(occupied && exited, `${label} offset ${offset} should score through the hem`);
      assert.ok(maxOff <= s.hoop.inner * 0.25, `${label} offset ${offset} drifted ${maxOff}px out through the side`);
    }
  }
});

test("a fast sideways attempt cannot leave the occupied sleeve through its wall", () => {
  const s = setup(); tick(s, 1);
  s.ball.y = 201; s.ball.vx = 1400; s.ball.vy = 150;
  tugNet2(s.hoop, s.ball);
  let sideLimited = false, exited = false;
  for (let i = 0; i < 180; i++) {
    advanceBall(s);
    if (s.hoop.net[0]!.netState!.inside) {
      assert.ok(Math.abs(s.ball.x - s.hoop.x) <= s.hoop.inner * 1.38);
      if (Math.abs(s.ball.vx) < 1) sideLimited = true;
    } else { exited = true; break; }
  }
  assert.ok(sideLimited && exited);
});

test("friction slows contact, leaves a remote ball alone, and stops after exit", () => {
  const s = setup(); tick(s, 1);
  s.ball.y = 180; s.ball.vy = 400;
  let slowed = false;
  for (let i = 0; i < 120; i++) {
    const vy = s.ball.vy + 900 / 120;
    advanceBall(s);
    if (s.ball.vy < vy - .1) slowed = true;
    if (s.hoop.net[0]!.netState!.exited) break;
  }
  assert.ok(slowed);
  s.ball.y = 700;
  const before = structuredClone(s.ball);
  stepNet2(s.hoop, s.ball, before.x, before.y, s.world, 1 / 60, 2, true);
  assert.deepEqual(s.ball, before);
  s.ball.y = 220; const disabled = structuredClone(s.ball);
  stepNet2(s.hoop, s.ball, s.ball.x, 190, s.world, 1 / 60, 2, false);
  assert.deepEqual(s.ball, disabled, "returning black-hole balls bypass cloth forces");
});

test("faster makes transfer more momentum; the opening relaxes after release", () => {
  const fast = setup(), slow = setup(); tick(fast, 1); tick(slow, 1);
  const restY = center(fast).y;
  for (const [s, speed] of [[fast, 850], [slow, 220]] as const) {
    s.ball.y = 198; s.ball.vy = speed; tugNet2(s.hoop, s.ball);
  }
  const momentum = (s: ReturnType<typeof setup>) => s.hoop.net.slice(NET_COLS).reduce((m, n) => m + n.y - n.py, 0);
  assert.ok(momentum(fast) > momentum(slow) * 2);
  let widest = 0;
  for (let i = 0; i < 90; i++) {
    advanceBall(fast);
    const hem = fast.hoop.net.slice(-NET_COLS);
    widest = Math.max(widest, Math.max(...hem.map(n => n.x)) - Math.min(...hem.map(n => n.x)));
  }
  tick(fast, 2);
  const hem = fast.hoop.net.slice(-NET_COLS);
  const width = Math.max(...hem.map(n => n.x)) - Math.min(...hem.map(n => n.x));
  assert.ok(width < widest - 5 && Math.abs(center(fast).y - restY) < 1.5);
});

test("wind gently varies, train acceleration and braking pull opposite ways, and support shaking excites the net", () => {
  const windy = setup(), still = setup(), accel = setup(), brake = setup(), shaken = setup();
  for (let i = 0; i < 240; i++) {
    for (const [s, force, wind] of [[windy, 0, 1], [still, 0, 0], [accel, -100, 0], [brake, 100, 0]] as const) {
      stepNet2(s.hoop, s.ball, s.ball.x, s.ball.y, s.world, 1 / 120, i / 120, false, { horizontalAccel: force, wind });
    }
    const t = i / 120;
    stepNet2(shaken.hoop, shaken.ball, shaken.ball.x, shaken.ball.y, shaken.world, 1 / 120, t, false,
      { wind: 0, motion: { angle: 0, pivotX: 200, pivotY: 200, accelX: t < .28 ? Math.sin(t * 60) * 750 : 0, accelY: 0 } });
    if (i === 25) assert.ok(Math.abs(center(shaken).x - center(still).x) > .2, "support motion must excite relative cloth motion");
  }
  const breeze = Math.abs(center(windy).x - center(still).x);
  assert.ok(breeze > .1 && breeze < 3, `wind should be gentle, got ${breeze}px`);
  assert.ok(center(accel).x < center(still).x - 2 && center(brake).x > center(still).x + 2);
});

test("the bottom has open diagonal loops and no horizontal ring", () => {
  const s = setup(), bottom = s.hoop.net.length - NET_COLS;
  assert.ok(NET2_EDGES.every(e => Math.floor(e.a / NET_COLS) !== Math.floor(e.b / NET_COLS)));
  for (let i = bottom; i < s.hoop.net.length; i++) {
    const joined = NET2_EDGES.filter(e => e.a === i || e.b === i);
    assert.equal(joined.length, 2, "each free bottom knot is joined by two diagonal ropes");
  }
});

test("an ascending ball lifts the contacted net and passes without capture or centering", () => {
  for (const speed of [220, 900]) for (const offset of [0, 8, -8]) {
    const s = setup(); tick(s, 2);
    const idle = structuredClone(s), base = center(s).y;
    const width = () => Math.max(...s.hoop.net.slice(-NET_COLS).map(n => n.x)) - Math.min(...s.hoop.net.slice(-NET_COLS).map(n => n.x));
    const initialWidth = width();
    s.ball.x += offset; s.ball.y = base + s.ball.r + 12; s.ball.vy = -speed;
    let occupied = false, exited = false, widest = initialWidth, highest = base, minDistance = Infinity;
    for (let i = 0; i < 480; i++) {
      const x = s.ball.x, y = s.ball.y;
      s.ball.y += s.ball.vy / 240;
      stepNet2(s.hoop, s.ball, x, y, s.world, 1 / 240, i / 240, true, { wind: 0 });
      assert.equal(s.ball.x, x, "cloth must not center an upward ball");
      stepNet2(idle.hoop, idle.ball, idle.ball.x, idle.ball.y, idle.world, 1 / 240, i / 240, false, { wind: 0 });
      const state = s.hoop.net[0]!.netState!;
      if (s.ball.y - s.ball.r > base + 2 && !occupied) assert.deepEqual(s.hoop.net.map(n => n.x), idle.hoop.net.map(n => n.x), "no automatic expansion before touching");
      assert.equal(state.inside, false, "an ascending ball must never enter captured-sleeve mode");
      if (state.fromBelow) {
        occupied = true;
        widest = Math.max(widest, width()); highest = Math.min(highest, center(s).y);
        minDistance = Math.min(minDistance, ropeDistance(s));
      } else if (occupied) {
        assert.ok(s.ball.y + s.ball.r < s.hoop.y, "ascending ball must leave above the rim");
        exited = true; break;
      }
      assert.ok(s.hoop.net.every(n => Number.isFinite(n.x + n.y + n.depth!)));
    }
    assert.ok(widest > initialWidth + 5 && highest < base - 10, `must fold then spread: ${JSON.stringify({ speed, offset, widest, highest, initialWidth, base })}`);
    assert.ok(occupied && exited, "upward passage must not trap the ball");
    assert.ok(minDistance > s.ball.r - 1, `upward rope penetration: ${s.ball.r - minDistance}px at ${speed}/${offset}`);
  }
});

test("cord lengths remain constant during horizontal and vertical stand recoil", () => {
  for (const [vx, vy] of [[600, 180], [0, 600], [-600, -180]]) {
    const s = setup(); tick(s, 2);
    strikeNet2(s.hoop, 228, 200, vx!, vy!, 600);
    for (let frame = 0; frame < 180; frame++) {
      stepNet2(s.hoop, s.ball, 200, 100, s.world, 1 / 120, frame / 120, false, { wind: 0 });
      for (const e of NET2_EDGES) {
        const a = s.hoop.net[e.a]!, b = s.hoop.net[e.b]!;
        const length = Math.hypot(b.x - a.x, b.y - b.depth! * RIM_RY - a.y + a.depth! * RIM_RY, b.depth! - a.depth!);
        const ratio = length / (e.length * s.hoop.inner);
        assert.ok(ratio > .98 && ratio < 1.02, `cord changed length under recoil: ${ratio}`);
      }
    }
  }
});

test("an upward ball cannot attract the cloth after separation or when scoring in reverse", () => {
  const s = setup(); tick(s, 2);
  s.ball.y = center(s).y + s.ball.r + 2; s.ball.vy = -300;
  for (let frame = 0; frame < 12; frame++) {
    const y = s.ball.y; s.ball.y += s.ball.vy / 240;
    stepNet2(s.hoop, s.ball, s.ball.x, y, s.world, 1 / 240, frame / 240, true, { wind: 0 });
  }
  const control = structuredClone(s);
  const beforeMake = structuredClone(s.hoop.net);
  tugNet2(s.hoop, s.ball);
  assert.deepEqual(s.hoop.net, beforeMake, "reverse scoring cannot bind or tug a rising ball");
  s.ball.x += 200; s.ball.y -= 200; s.ball.vx = 500; s.ball.vy = -900;
  for (let frame = 0; frame < 120; frame++) {
    stepNet2(s.hoop, s.ball, s.ball.x, s.ball.y, s.world, 1 / 120, frame / 120, true, { wind: 0 });
    stepNet2(control.hoop, control.ball, control.ball.x, control.ball.y, control.world, 1 / 120, frame / 120, false, { wind: 0 });
    assert.deepEqual(s.hoop.net.map(n => [n.x, n.y, n.depth, n.px, n.py, n.prevDepth]),
      control.hoop.net.map(n => [n.x, n.y, n.depth, n.px, n.py, n.prevDepth]),
      "after separation, the net must evolve as though the ball is absent");
  }
});

test("an incomplete upward entry can fall back out and restore the hanging sleeve", () => {
  const s = setup(); tick(s, 2);
  const baseline = center(s);
  s.ball.y = baseline.y + s.ball.r + 1; s.ball.vy = -140;
  let folded = false;
  for (let i = 0; i < 180; i++) {
    advanceBall(s);
    folded ||= s.hoop.net[0]!.netState!.fromBelow;
  }
  assert.ok(folded && !s.hoop.net[0]!.netState!.inside && s.ball.y > s.hoop.y + 100);
  tick(s, 3);
  assert.ok(Math.abs(center(s).y - baseline.y) < 1.5, "partial entry must not leave the net inverted");
});

test("stand hits recoil opposite the incoming direction and weaken with distance", () => {
  for (const [vx, vy] of [[600, 0], [-600, 0], [0, 600], [0, -600], [400, 400]]) {
    const near = setup(); tick(near, 2);
    const far = structuredClone(near), before = structuredClone(near);
    strikeNet2(near.hoop, 228, 200, vx!, vy!, 600);
    strikeNet2(far.hoop, 340, 200, vx!, vy!, 600);
    const kick = (s: typeof near) => s.hoop.net.slice(NET_COLS).reduce((out, n, i) => {
      const old = before.hoop.net[i + NET_COLS]!;
      out.x += (old.px - n.px) / n.netDt!;
      out.y += (old.py - n.py) / n.netDt!;
      return out;
    }, { x: 0, y: 0 });
    const a = kick(near), b = kick(far);
    assert.ok(a.x * vx! + a.y * vy! < 0, "recoil must oppose pre-bounce velocity");
    assert.ok(Math.hypot(a.x, a.y) > Math.hypot(b.x, b.y) * 3, "distant brace hits should be much weaker");
    assert.deepEqual(near.hoop.net.map(n => [n.x, n.y]), before.hoop.net.map(n => [n.x, n.y]));
    assert.deepEqual(near.hoop.net.slice(0, NET_COLS).map(n => [n.px, n.py]), before.hoop.net.slice(0, NET_COLS).map(n => [n.px, n.py]));
    const once = structuredClone(near.hoop.net);
    strikeNet2(near.hoop, 228, 200, vx!, vy!, 600);
    assert.deepEqual(near.hoop.net, once, "one collision cannot inject momentum again in adjacent substeps");
  }
});

test("impact feedback visibly swings back before settling, without resting-contact jitter", () => {
  const s = setup(); tick(s, 2);
  const control = structuredClone(s), start = structuredClone(s.hoop.net);
  strikeNet2(s.hoop, 228, 200, 5, 0, 5);
  assert.deepEqual(s.hoop.net, start, "resting contact should not shake the net");
  strikeNet2(s.hoop, 228, 200, 600, 0, 600);
  let min = 0, rebound = 0;
  for (let i = 0; i < 480; i++) {
    for (const a of [s, control]) stepNet2(a.hoop, a.ball, a.ball.x, a.ball.y, a.world, 1 / 120, i / 120, false, { wind: 0 });
    const dx = center(s).x - center(control).x;
    min = Math.min(min, dx); if (i > 30) rebound = Math.max(rebound, dx);
  }
  assert.ok(min < -5 && rebound > .2, `expected a visible whip and reversal, got ${min}, ${rebound}`);
  assert.ok(Math.abs(center(s).x - center(control).x) < .3, "net must settle after the impulse");
});

test("net2 keeps the slower cloth and net3 keeps the snappy profile", () => {
  assert.deepEqual(
    [NET2_PROFILE.shapeRestore, NET2_PROFILE.hangAccel, NET2_PROFILE.dampRate, NET2_PROFILE.contactResponse,
      NET2_PROFILE.hitScale, NET2_PROFILE.hitCap, NET2_PROFILE.tugGain, NET2_PROFILE.envResponse, NET2_PROFILE.rowPitch],
    [16, 9, 4.4, 54, 0.32, 5.5, 0.25, 1, 1],
  );
  assert.deepEqual(
    [NET3_PROFILE.shapeRestore, NET3_PROFILE.hangAccel, NET3_PROFILE.dampRate, NET3_PROFILE.contactResponse,
      NET3_PROFILE.hitScale, NET3_PROFILE.hitCap, NET3_PROFILE.tugGain, NET3_PROFILE.rowPitch],
    [56, 31, 8.1, 120, 0.59, 10.2, 0.46, 1.074],
  );
  assert.equal(NET3_PROFILE.envResponse, NET3_PROFILE.hangAccel / 9);
  assert.equal(NET2_PROFILE.releasedAccel, NET3_PROFILE.releasedAccel);
});

test("net3 peaks and returns sooner than net2 on the same stand hit", () => {
  const swing = (profile: NetProfile) => {
    const s = setup();
    tick(s, 2);
    const control = structuredClone(s);
    strikeNet2(s.hoop, 228, 200, 600, 0, 600, profile);
    let min = 0, minT = 0, reboundT = 0;
    const env = { wind: 0, profile };
    for (let i = 0; i < 200; i++) {
      stepNet2(s.hoop, s.ball, s.ball.x, s.ball.y, s.world, 1 / 120, i / 120, false, env);
      stepNet2(control.hoop, control.ball, control.ball.x, control.ball.y, control.world, 1 / 120, i / 120, false, env);
      const dx = center(s).x - center(control).x;
      if (dx < min) { min = dx; minT = (i + 1) / 120; }
      if (reboundT === 0 && minT > 0 && (i + 1) / 120 > minT + 0.04 && dx > 0.2) reboundT = (i + 1) / 120;
    }
    return { min, minT, reboundT };
  };
  const slow = swing(NET2_PROFILE);
  const fast = swing(NET3_PROFILE);
  assert.ok(slow.min < -5 && fast.min < -5, `both whips should stay visible: ${slow.min}, ${fast.min}`);
  assert.ok(fast.minT < slow.minT * 0.75, `net3 should peak sooner: ${fast.minT} vs ${slow.minT}`);
  assert.ok(fast.reboundT > 0 && slow.reboundT > 0 && fast.reboundT < slow.reboundT,
    `net3 should return sooner: ${fast.reboundT} vs ${slow.reboundT}`);
});

function screenRopeDistance(s: ReturnType<typeof setup>) {
  let min = Infinity;
  for (const e of NET2_EDGES) {
    const a = s.hoop.net[e.a]!, b = s.hoop.net[e.b]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const sq = dx * dx + dy * dy;
    const t = sq > 1e-8 ? Math.max(0, Math.min(1, ((s.ball.x - a.x) * dx + (s.ball.y - a.y) * dy) / sq)) : 0;
    min = Math.min(min, Math.hypot(a.x + dx * t - s.ball.x, a.y + dy * t - s.ball.y));
  }
  return min;
}

function settleCloth(profile: NetProfile) {
  const s = setup();
  const far = { ...s.ball, x: 900, y: 40, vx: 0, vy: 0 };
  for (let i = 0; i < 240; i++) stepNet2(s.hoop, far, far.x, far.y, s.world, 1 / 120, i / 120, false, { wind: 0, profile });
  return s;
}

test("side contact meets the weave, cups it, and does not punch through", () => {
  const dt = 1 / 60;
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) {
    const label = profile === NET3_PROFILE ? "net3" : "net2";
    for (const y0 of [210, 222, 232]) for (const dir of [1, -1] as const) {
      for (const [speed, gravity] of [[650, 1400], [1600, 2500]] as const) {
        const s = settleCloth(profile);
        const hem = Math.max(...s.hoop.net.map(n => n.y));
        const rest = s.hoop.net.map(n => ({ x: n.x, y: n.y }));
        s.ball.x = s.hoop.x - dir * 110;
        s.ball.y = y0;
        s.ball.vx = dir * speed;
        s.ball.vy = 0;
        let minOverlap = Infinity, crossed = false, brakedFar = false, slowed = false, touched = false;
        let peakNear = 0, peakFar = 0, brakeDistance = Infinity;
        for (let i = 0; i < 40; i++) {
          const x = s.ball.x, y = s.ball.y, vx0 = s.ball.vx;
          s.ball.vy += gravity * dt;
          s.ball.x += s.ball.vx * dt;
          s.ball.y += s.ball.vy * dt;
          stepNet2(s.hoop, s.ball, x, y, s.world, dt, i * dt, true, { wind: 0, profile });
          const distance = screenRopeDistance(s);
          if (distance <= s.ball.r + 4) touched = true;
          if (!touched && distance > s.ball.r + 8 && Math.abs(s.ball.vx) < Math.abs(speed) * 0.9) brakedFar = true;
          if (Math.abs(s.ball.vx) < Math.abs(vx0) - 12) brakeDistance = Math.min(brakeDistance, distance);
          if (s.ball.y > s.hoop.y - 4 && s.ball.y < hem + 6) {
            minOverlap = Math.min(minOverlap, distance);
            if (dir * (s.ball.x - s.hoop.x) >= 0) crossed = true;
          }
          if (Math.abs(s.ball.vx) < Math.abs(speed) * 0.72) slowed = true;
          let near = 0, far = 0, nearCount = 0, farCount = 0;
          for (let k = 0; k < rest.length; k++) {
            const moved = Math.hypot(s.hoop.net[k]!.x - rest[k]!.x, s.hoop.net[k]!.y - rest[k]!.y);
            const onHitSide = dir > 0 ? rest[k]!.x < s.hoop.x : rest[k]!.x > s.hoop.x;
            if (onHitSide && Math.abs(rest[k]!.y - y0) < 36) { near += moved; nearCount++; }
            else if (!onHitSide && Math.abs(rest[k]!.x - s.hoop.x) > 12) { far += moved; farCount++; }
          }
          if (nearCount) peakNear = Math.max(peakNear, near / nearCount);
          if (farCount) peakFar = Math.max(peakFar, far / farCount);
          if (s.ball.y > hem + 90) break;
        }
        const where = `${label} y=${y0} v=${speed * dir}`;
        assert.equal(brakedFar, false, `${where} slowed before reaching the weave`);
        assert.equal(crossed, false, `${where} punched through the sleeve`);
        assert.ok(brakeDistance <= s.ball.r + 4, `${where} first resistance at ${brakeDistance}px from the ropes`);
        assert.ok(minOverlap >= s.ball.r - 8, `${where} ropes cut the ball by ${s.ball.r - minOverlap}px`);
        assert.ok(peakNear > peakFar + 0.6, `${where} contact should be local, near ${peakNear} far ${peakFar}`);
        if (minOverlap < s.ball.r + 1) assert.equal(slowed, true, `${where} should lose speed into the mesh`);
      }
    }
    const open = settleCloth(profile);
    const hem = Math.max(...open.hoop.net.map(n => n.y));
    open.ball.x = open.hoop.x - 110;
    open.ball.y = hem + open.ball.r + 8;
    open.ball.vx = 700;
    open.ball.vy = 0;
    let crossed = false, minDistance = Infinity;
    for (let i = 0; i < 40; i++) {
      const x = open.ball.x, y = open.ball.y;
      open.ball.x += open.ball.vx * dt;
      stepNet2(open.hoop, open.ball, x, y, open.world, dt, i * dt, true, { wind: 0, profile });
      minDistance = Math.min(minDistance, screenRopeDistance(open));
      if (open.ball.x > open.hoop.x + 24) crossed = true;
    }
    assert.ok(crossed, "the bottom opening must still let a ball through");
    assert.ok(open.ball.vx > 0, "passing under the hem must not bounce");
    assert.ok(minDistance >= open.ball.r - 2, `hem mouth clipped the ball by ${open.ball.r - minDistance}px`);
  }
});

test("a slower make hesitates longer than a fast one and still falls through", () => {
  const dt = 1 / 60;
  const g = 2500;
  const run = (profile: NetProfile, vy0: number, scoreFirst = false) => {
    const s = settleCloth(profile);
    s.ball.x = s.hoop.x;
    s.ball.y = s.hoop.y - 16;
    s.ball.vx = 24;
    s.ball.vy = vy0;
    let seen = false, exited = false, minVy = Infinity, dwell = 0, entryVy = 0, firstVy = 0;
    let rise = 0, deepest = -Infinity, highest = Infinity;
    for (let i = 0; i < 220; i++) {
      const x = s.ball.x, y = s.ball.y;
      s.ball.vy += g * dt;
      s.ball.x += s.ball.vx * dt;
      s.ball.y += s.ball.vy * dt;
      if (scoreFirst && y < s.hoop.y && s.ball.y >= s.hoop.y) tugNet2(s.hoop, s.ball, profile);
      stepNet2(s.hoop, s.ball, x, y, s.world, dt, i * dt, true, { wind: 0, profile });
      const state = s.hoop.net[0]!.netState!;
      if (state.inside && s.ball.y > s.hoop.y) {
        if (!seen) {
          entryVy = state.entryVy;
          firstVy = s.ball.vy;
        }
        seen = true;
        dwell += dt;
        minVy = Math.min(minVy, s.ball.vy);
        if (s.ball.y > deepest) deepest = s.ball.y;
        rise = Math.max(rise, deepest - s.ball.y);
        highest = Math.min(highest, s.ball.y);
      } else if (seen) {
        const hem = Math.max(...s.hoop.net.map(n => n.y));
        assert.ok(s.ball.y > hem - s.ball.r, "the make must leave through the hem");
        assert.ok(Math.abs(s.ball.x - s.hoop.x) <= s.hoop.inner * 0.35);
        exited = true;
        break;
      }
    }
    return { seen, exited, minVy, dwell, entryVy, firstVy, rise, highest, hoopY: s.hoop.y };
  };
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) {
    const label = profile === NET3_PROFILE ? "net3" : "net2";
    for (const scoreFirst of [false, true]) {
      const how = scoreFirst ? "score" : "cross";
      const slow = run(profile, 200, scoreFirst);
      const mid = run(profile, 420, scoreFirst);
      const fast = run(profile, 1450, scoreFirst);
      assert.ok(slow.seen && slow.exited && mid.exited && fast.seen && fast.exited, `${label} ${how} should score through the hem`);
      assert.ok(slow.highest > slow.hoopY && mid.highest > mid.hoopY && fast.highest > fast.hoopY,
        `${label} ${how} center crossed back above the rim`);
      assert.ok(slow.minVy > 40 && mid.minVy > 40 && fast.minVy > 40, `${label} ${how} stalled in the sleeve`);
      assert.ok(slow.firstVy / slow.entryVy < 0.55, `${label} ${how} soft stepped to ${slow.firstVy} of ${slow.entryVy}`);
      assert.ok(slow.minVy / slow.entryVy < 0.55, `${label} ${how} soft held ${slow.minVy} of ${slow.entryVy}`);
      assert.ok(slow.rise > 4, `${label} ${how} soft rise only ${slow.rise}px`);
      assert.ok(mid.firstVy / mid.entryVy < 0.6, `${label} ${how} medium stepped to ${mid.firstVy} of ${mid.entryVy}`);
      assert.ok(mid.minVy / mid.entryVy < 0.6, `${label} ${how} medium held ${mid.minVy} of ${mid.entryVy}`);
      assert.ok(mid.rise > 3, `${label} ${how} medium rise only ${mid.rise}px`);
      assert.ok(fast.minVy / fast.entryVy > 0.84, `${label} ${how} hard slowed to ${fast.minVy} from ${fast.entryVy}`);
      assert.ok(fast.rise < 2.5, `${label} ${how} hard rise ${fast.rise}px`);
      assert.ok(fast.dwell < 0.09, `${label} ${how} hard dwell ${fast.dwell}s`);
      assert.ok(slow.dwell > fast.dwell * 2.5, `${label} ${how} dwell slow ${slow.dwell}s vs fast ${fast.dwell}s`);
      assert.ok(slow.rise > fast.rise + 3, `${label} ${how} rise slow ${slow.rise}px vs fast ${fast.rise}px`);
    }
  }
});

test("clearing the hem tugs the net opposite the make's entry", () => {
  const dt = 1 / 120;
  const g = 900;
  const hemOf = (net: ReturnType<typeof setup>["hoop"]["net"]) => {
    const row = net.slice(-NET_COLS);
    return {
      x: row.reduce((sum, n) => sum + n.x, 0) / row.length,
      y: row.reduce((sum, n) => sum + n.y, 0) / row.length,
    };
  };
  for (const profile of [NET2_PROFILE, NET3_PROFILE]) {
    const label = profile === NET3_PROFILE ? "net3" : "net2";
    for (const scoreFirst of [false, true]) for (const vx0 of [240, -240]) {
      const s = settleCloth(profile);
      s.ball.x = s.hoop.x - Math.sign(vx0) * 4;
      s.ball.y = s.hoop.y - 30;
      s.ball.vx = vx0;
      s.ball.vy = 400;
      let entry = { vx: 0, vy: 0 };
      let seen = false;
      let caught = false;
      const how = scoreFirst ? "score" : "cross";
      for (let i = 0; i < 240 && !caught; i++) {
        const snap = structuredClone(s);
        const x = s.ball.x, y = s.ball.y;
        s.ball.vy += g * dt;
        s.ball.x += s.ball.vx * dt;
        s.ball.y += s.ball.vy * dt;
        // The engine scores, and tugs, before the cloth step on the crossing frame.
        if (scoreFirst && y < s.hoop.y && s.ball.y >= s.hoop.y) tugNet2(s.hoop, s.ball, profile);
        const was = s.hoop.net[0]!.netState?.inside ?? false;
        stepNet2(s.hoop, s.ball, x, y, s.world, dt, i * dt, true, { wind: 0, profile });
        const state = s.hoop.net[0]!.netState!;
        if (state.inside) {
          seen = true;
          entry = { vx: state.entryVx, vy: state.entryVy };
        } else if (was && seen) {
          snap.ball.x = 900; snap.ball.y = 40; snap.ball.vx = 0; snap.ball.vy = 0;
          stepNet2(snap.hoop, snap.ball, snap.ball.x, snap.ball.y, snap.world, dt, i * dt, false, { wind: 0, profile });
          let lift = 0, side = 0, minY = Infinity;
          for (let k = 0; k < 24; k++) {
            const lx = s.ball.x, ly = s.ball.y;
            s.ball.vy += g * dt;
            s.ball.x += s.ball.vx * dt;
            s.ball.y += s.ball.vy * dt;
            stepNet2(s.hoop, s.ball, lx, ly, s.world, dt, (i + 1 + k) * dt, true, { wind: 0, profile });
            stepNet2(snap.hoop, snap.ball, snap.ball.x, snap.ball.y, snap.world, dt, (i + 1 + k) * dt, false, { wind: 0, profile });
            const a = hemOf(s.hoop.net), b = hemOf(snap.hoop.net);
            const dx = a.x - b.x, dy = a.y - b.y;
            if (dy < lift) lift = dy;
            if (Math.abs(dx) > Math.abs(side)) side = dx;
            minY = Math.min(minY, ...s.hoop.net.slice(-NET_COLS).map(n => n.y));
          }
          assert.ok(lift < -9, `${label} ${how} vx ${vx0} hem lift ${lift}`);
          assert.ok(side * entry.vx < 0, `${label} ${how} vx ${vx0} kicked ${side} along entry ${entry.vx}`);
          assert.ok(Math.abs(side) > 4, `${label} ${how} vx ${vx0} sideways tug only ${side}`);
          assert.ok(minY > s.hoop.y, `${label} ${how} hem crossed above the rim at ${minY}`);
          caught = true;
        }
      }
      assert.ok(caught, `${label} ${how} vx ${vx0} should leave through the hem`);
    }
  }
});

test("net3 idle hem hangs as deep as net1 while net2 stays shorter", () => {
  const far = { x: 900, y: 40, vx: 0, vy: 0, r: 19, spin: 0, omega: 0, squash: 1, scored: false, hitRim: false, hitBoard: false } as Ball;
  const depth = (net: Hoop["net"], y: number, inner: number) => (Math.max(...net.map((n) => n.y)) - y) / inner;
  const settle = (profile?: NetProfile) => {
    const s = setup();
    if (profile) {
      for (let i = 0; i < 360; i++) stepNet2(s.hoop, far, far.x, far.y, s.world, 1 / 120, i / 120, false, { wind: 0, profile });
    } else {
      for (let i = 0; i < 240; i++) stepNet(s.hoop, far, far.x, far.y, s.world, 1 / 60, i / 60, false);
    }
    return depth(s.hoop.net, s.hoop.y, s.hoop.inner);
  };
  const net1 = settle();
  const net2 = settle(NET2_PROFILE);
  const net3 = settle(NET3_PROFILE);
  assert.ok(Math.abs(net3 - net1) < 0.02, `net3 hang ${net3} inner vs net1 ${net1}`);
  assert.ok(net2 < net1 - 0.05, `net2 should keep its shorter hang, got ${net2} vs net1 ${net1}`);
});
