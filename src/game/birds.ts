import { sootFilter } from "./train-smoke.ts";
import type { World } from "./types";
import { sweepGantryCircle, type TrainGantry } from "./train-gantry.ts";

export type BirdKind = "silly" | "dive" | "eagle";
export type BirdMode = "fly" | "patrol" | "warning" | "dive" | "outside" | "climb" | "carry" | "stunned" | "fall" | "frozen" | "absorbing" | "shattered";
const STUN_SECONDS = 0.4;
type Edge = "left" | "right" | "top" | "bottom";
type View = Pick<World, "w" | "h" | "floorY" | "ballR">;
type Body = { x: number; y: number; vx: number; vy: number; r: number };
export type Bird = Body & {
  id: number; kind: BirdKind; mode: BirdMode;
  px: number; py: number; age: number; modeTime: number; flap: number;
  dir: number; baseY: number; attackIn: number; hiddenByCloud: boolean;
  /** Visible patrol heading at the start of an attack, independent of ground velocity. */
  attackDir: number;
  /** Ground velocity; vx is always velocity relative to the train. */
  flightVx: number; launchTrainSpeed: number;
  exitEdge: Edge; exitX: number; reentry: "patrol" | "climb";
  burnt?: boolean;
  sootLeft?: number;
  rewarded?: boolean;
};
type ReturnPoint = { x: number; y: number; vx: number; vy: number; left: number };
export type BirdState = {
  birds: Bird[]; clock: number; nextWave: number; nextId: number;
  carrier: number | null; respawn: ReturnPoint | null; safeLeft: number;
  enteringFromTop: boolean;
  catches: number; kills: number; returns: number;
  trainSpeed: number;
  iceBreaks: number; absorbed: number;
};
export function createBirds(): BirdState {
  return { birds: [], clock: 0, nextWave: 3, nextId: 1, carrier: null,
    respawn: null, safeLeft: 0, enteringFromTop: false, catches: 0, kills: 0, returns: 0, trainSpeed: 0, iceBreaks: 0, absorbed: 0 };
}
export type BirdSkills = {
  unobservable?: boolean;
  lethal?: boolean;
  burn?: boolean;
  frostChance?: number;
  hole?: { x: number; y: number; r: number };
  block?: (catching: boolean, nx: number, ny: number) => boolean;
  contact?: (impact: number, distance: number) => void;
};
export function birdOwnsBall(s: BirdState) { return s.carrier !== null || s.respawn !== null; }

/** One species per wave, never replace a living wave or an occupied ball. */
export function spawnBirdWave(s: BirdState, w: View, kind: BirdKind, rng = Math.random, count?: number, trainSpeed = s.trainSpeed) {
  if (s.birds.length || birdOwnsBall(s)) return false;
  const n = kind === "eagle" ? 1 : Math.min(2, Math.max(1, count ?? (rng() < 0.35 ? 2 : 1)));
  const dir = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const r = w.ballR * (kind === "eagle" ? 1.05 : 0.9);
    const flightVx = (kind !== "silly" ? trainSpeed : 0) + dir * w.w * (kind === "silly" ? 0.18 : kind === "dive" ? 1.55 : 0.65);
    const vx = flightVx - trainSpeed;
    const x = vx > 0 ? -r * (3 + i * 5) : w.w + r * (3 + i * 5);
    const y = kind === "eagle" ? randomPatrolBase(w, r, rng) : w.h * (0.24 + rng() * 0.28);
    s.birds.push({ id: s.nextId++, kind, mode: kind === "eagle" ? "patrol" : "fly",
      x, y, px: x, py: y, r, vx, flightVx, launchTrainSpeed: trainSpeed,
      vy: kind === "dive" ? w.h * (0.22 + rng() * 0.14) : 0,
      age: 0, modeTime: 0, flap: rng() * Math.PI * 2, dir, baseY: y, attackDir: 0,
      attackIn: w.w / Math.max(w.w * 0.2, Math.abs(vx)) * (0.2 + rng() * 0.25), hiddenByCloud: rng() < 0.45,
      exitEdge: vx > 0 ? "right" : "left", exitX: x, reentry: "patrol" });
  }
  return true;
}
function setMode(b: Bird, mode: BirdMode) { b.mode = mode; b.modeTime = 0; }
function randomPatrolBase(w: View, r: number, rng: () => number) {
  // Leave room for wings above and the full arc/body below, all in the upper quarter.
  const top = Math.min(r * 1.6, w.h * 0.07);
  const bottom = Math.max(top, w.h * 0.13 - r);
  return top + rng() * (bottom - top);
}
function patrolY(b: Bird, w: View) {
  return b.baseY + w.h * 0.12 * Math.sin(Math.max(0, Math.min(1, b.x / w.w)) * Math.PI);
}
function canDiveForward(b: Bird, ball: Body, w: View, direction: number) {
  return direction !== 0 && (ball.x - b.x) * direction > 0 &&
    ball.y > b.y + b.r && ball.x > 0 && ball.x < w.w;
}
function exitEdge(b: Bird, w: View): Edge | null {
  const margin = b.r * 2.4;
  if (b.x < -margin && b.vx < 0) return "left";
  if (b.x > w.w + margin && b.vx > 0) return "right";
  if (b.y < -margin && b.vy < 0) return "top";
  if (b.y > w.h + margin && b.vy > 0) return "bottom";
  return null;
}
function leaveScreen(b: Bird, edge: Edge, reentry: "patrol" | "climb") {
  b.exitEdge = edge; b.exitX = b.x; b.reentry = reentry;
  b.hiddenByCloud = false; setMode(b, "outside");
}
function enterAgain(b: Bird, w: View, trainSpeed: number, rng: () => number) {
  const margin = b.r * 2.4;
  // Choose a new altitude only while hidden; never jump vertically during a pass.
  b.baseY = randomPatrolBase(w, b.r, rng);
  if (b.reentry === "climb") {
    b.x = b.exitEdge === "left" ? -margin : b.exitEdge === "right" ? w.w + margin
      : Math.max(w.w * 0.2, Math.min(w.w * 0.8, b.exitX));
    b.y = b.exitEdge === "bottom" ? w.h + margin
      : Math.min(w.h - b.r * 2, w.floorY + b.r * 4);
    b.dir = b.exitEdge === "right" ? -1 : 1;
    b.flightVx = trainSpeed; b.vx = 0; b.vy = 0;
    setMode(b, "climb");
  } else {
    // Return from the edge just exited, heading back across the same arc.
    b.dir = b.exitEdge === "right" ? -1 : 1;
    b.flightVx = trainSpeed + b.dir * w.w * 0.65;
    b.vx = b.flightVx - trainSpeed;
    b.x = b.vx > 0 ? -margin : w.w + margin;
    b.y = patrolY(b, w); b.vy = 0;
    b.attackIn = w.w / Math.max(w.w * 0.2, Math.abs(b.vx)) * (0.2 + rng() * 0.25);
    b.hiddenByCloud = rng() < 0.45; setMode(b, "patrol");
  }
  // Re-entry is not a swept path through the whole screen.
  b.px = b.x; b.py = b.y;
}
function cling(b: Bird, ball: Body) {
  ball.x = b.x;
  ball.y = b.y + b.r * 0.6 + ball.r;
  ball.vx = b.vx; ball.vy = b.vy;
}
function returnPoint(b: Bird, w: View, ball: Body, rng: () => number): ReturnPoint | null {
  const margin = Math.max(b.r * 2, ball.r * 2.5);
  if (b.x >= -margin && b.x <= w.w + margin && b.y >= -margin && b.y <= w.h + margin) return null;
  const inset = Math.min(w.w / 2, ball.r * 2);
  return { x: inset + rng() * (w.w - inset * 2), y: -ball.r * 2.5,
    vx: 0, vy: w.h * 0.12, left: 1.5 };
}
function respawnBall(s: BirdState, ball: Body) {
  if (!s.respawn) return;
  const { x, y, vx, vy } = s.respawn;
  Object.assign(ball, { x, y, vx, vy });
  s.enteringFromTop = true;
  s.respawn = null; s.safeLeft = 0.8; s.returns++;
}

/** Exclusive wave roll: unused probability is a quiet interval, overflow is normalized. */
export function rollBirdWave(madeCount: number, roll: number): BirdKind | null {
  const bonus = Math.max(0, Math.floor(Number.isFinite(madeCount) ? madeCount : 0)) * 0.02;
  const silly = Math.min(1, 0.20 + bonus);
  const dive = Math.min(1, 0.10 + bonus);
  const eagle = Math.min(1, 0.05 + bonus);
  const value = roll * Math.max(1, silly + dive + eagle);
  return value < silly ? "silly" : value < silly + dive ? "dive" : value < silly + dive + eagle ? "eagle" : null;
}

/** Simulation only: no wall clock, DOM or rendering state. Returns true on a ball teleport. */
export function stepBirds(s: BirdState, w: View, ball: Body, dt: number, allowSpawn = true, rng = Math.random, trainSpeed = 0, madeCount = 0, skills: BirdSkills = {}) {
  if (!(dt > 0)) return false;
  s.clock += dt;
  s.trainSpeed = trainSpeed;
  s.safeLeft = Math.max(0, s.safeLeft - dt);
  let returned = false;
  if (s.respawn) {
    s.respawn.left -= dt;
    if (s.respawn.left <= 1e-8) { respawnBall(s, ball); returned = true; }
  }
  if (!s.birds.length && !birdOwnsBall(s) && allowSpawn) {
    s.nextWave -= dt;
    if (s.nextWave <= 0) {
      const kind = rollBirdWave(madeCount, rng());
      s.nextWave = 4 + rng() * 4;
      if (kind) spawnBirdWave(s, w, kind, rng);
    }
  }
  for (const b of s.birds) {
    b.px = b.x; b.py = b.y; b.age += dt; b.modeTime += dt;
    b.flap += dt * (b.kind === "silly" ? 15 : 21);
    b.vx = b.flightVx - trainSpeed;
    if (b.mode === "shattered") continue;
    if (skills.hole && b.mode !== "carry" && b.mode !== "outside" && b.mode !== "absorbing" && b.x > -b.r * 2 && b.x < w.w + b.r * 2) {
      setMode(b, "absorbing"); b.hiddenByCloud = false;
    }
    if (b.mode === "absorbing") {
      if (!skills.hole) { setMode(b, "fall"); b.flightVx = 0; b.vy = 0; continue; }
      const dx = skills.hole.x - b.x, dy = skills.hole.y - b.y;
      const distance = Math.hypot(dx, dy), travel = Math.min(distance, w.w * 1.4 * dt);
      if (distance > 0) { b.x += dx / distance * travel; b.y += dy / distance * travel; }
      b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt;
      if (distance - travel <= skills.hole.r * 0.5) { b.age = 1000; s.absorbed++; b.rewarded = true; }
      continue;
    }
    if (b.mode === "frozen") {
      b.flightVx = 0; b.vx = -trainSpeed; b.vy += w.h * 0.9 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      continue;
    }
    if (b.mode === "outside") {
      if (b.modeTime >= 0.65) enterAgain(b, w, trainSpeed, rng);
      continue;
    }
    if (b.mode === "stunned") {
      b.flightVx = 0; b.vx = 0 - trainSpeed;
      b.x += b.vx * dt;
      if (b.modeTime < STUN_SECONDS) continue;
      const fallingDt = Math.min(dt, b.modeTime - STUN_SECONDS);
      setMode(b, "fall"); b.vy = w.h * 0.9 * fallingDt;
      b.y += b.vy * fallingDt;
      continue;
    }
    if (b.mode === "fall") {
      b.flightVx = 0; b.vx = 0 - trainSpeed; b.vy += w.h * 0.9 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      continue;
    }
    if (b.kind === "silly") {
      b.x += b.vx * dt;
      b.y = b.baseY + Math.sin(b.age * 2.2) * b.r * 0.45;
      b.vy = (b.y - b.py) / dt;
    } else if (b.kind === "dive") {
      // Keep a readable diagonal even if the accelerating train catches up.
      // Ground velocity still determines relative motion above this minimum.
      const minAcross = Math.max(w.w * 0.8, Math.abs(b.vy));
      if (b.vx * b.dir < minAcross) {
        b.vx = b.dir * minAcross;
        b.flightVx = trainSpeed + b.vx;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
    } else if (b.mode === "patrol" || b.mode === "warning") {
      // Actively keep the chosen heading as the train accelerates; never stall.
      if (b.vx * b.dir < w.w * 0.12) {
        b.vx = b.dir * w.w * 0.12; b.flightVx = trainSpeed + b.vx;
      }
      b.x += b.vx * dt;
      b.y = patrolY(b, w); b.vy = (b.y - b.py) / dt;
      const edge = exitEdge(b, w);
      if (edge) { leaveScreen(b, edge, "patrol"); continue; }
      if (b.mode === "patrol") {
        const visible = b.x > b.r * 2 && b.x < w.w - b.r * 2;
        const direction = Math.sign(b.vx);
        if (direction) b.dir = direction;
        if (visible) b.attackIn -= dt;
        if (visible && b.attackIn <= 0 && !skills.unobservable && !birdOwnsBall(s) && canDiveForward(b, ball, w, direction)) {
          b.attackDir = direction;
          b.hiddenByCloud = false; setMode(b, "warning");
        }
      } else {
        if (skills.unobservable || Math.sign(b.vx) !== b.attackDir || !canDiveForward(b, ball, w, b.attackDir)) {
          setMode(b, "patrol"); b.attackIn = 0.25;
          continue;
        }
        if (b.modeTime >= 0.5 - 1e-8) {
          // Prediction may not turn the eagle around even if the ball is moving behind it.
          const targetX = Math.max(ball.r, Math.min(w.w - ball.r, ball.x + ball.vx * 0.16));
          const dx = b.attackDir * Math.max(b.r * 0.25, (targetX - b.x) * b.attackDir);
          const dy = Math.max(b.r * 2, Math.min(w.floorY - ball.r, ball.y + ball.vy * 0.1) - b.y);
          const len = Math.hypot(dx, dy);
          b.vx = dx / len * w.h * 0.95; b.vy = dy / len * w.h * 0.95;
          b.flightVx = b.vx + trainSpeed;
          b.dir = b.attackDir; b.hiddenByCloud = false; setMode(b, "dive");
        }
      }
    } else if (b.mode === "dive") {
      // Keep the committed heading if train acceleration would otherwise reverse it.
      if (b.attackDir && b.vx * b.attackDir < w.w * 0.04) {
        b.vx = b.attackDir * w.w * 0.04;
        b.flightVx = trainSpeed + b.vx;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const edge = exitEdge(b, w);
      if (edge) { leaveScreen(b, edge, "climb"); continue; }
    } else if (b.mode === "climb") {
      const targetX = b.exitEdge === "left" ? w.w * 0.4 : b.exitEdge === "right" ? w.w * 0.6
        : Math.max(w.w * 0.25, Math.min(w.w * 0.75, b.exitX));
      b.vx = Math.max(-w.w * 0.18, Math.min(w.w * 0.18, (targetX - b.x) * 0.55));
      b.flightVx = trainSpeed + b.vx; b.vy = -w.h * 0.09;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y <= patrolY(b, w)) {
        setMode(b, "patrol"); b.attackIn = 0.7 + rng();
        b.flightVx = trainSpeed + b.dir * w.w * 0.32; b.hiddenByCloud = rng() < 0.45;
      }
    } else if (b.mode === "carry") {
      // Accelerate both lift and escape after a grab, including grabs during recovery.
      const lift = Math.min(1, b.modeTime / 0.65);
      b.flightVx = b.launchTrainSpeed + b.dir * w.w * (0.25 + 0.65 * lift);
      b.vx = b.flightVx - trainSpeed;
      b.vy = -w.h * (0.12 + 0.48 * lift);
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    if (s.carrier === b.id) {
      cling(b, ball);
      const point = returnPoint(b, w, ball, rng);
      if (point) {
        s.carrier = null; s.respawn = point;
        b.age = 1000;
        if (point.left === 0) { respawnBall(s, ball); returned = true; }
      }
    }
  }
  const wasActive = s.birds.length > 0;
  s.birds = s.birds.filter(b => {
    if (b.mode === "shattered") return b.modeTime < 0.45;
    if (b.mode === "frozen") return b.y < w.h + b.r * 3;
    if (b.age >= 1000 || (b.mode === "fall" && b.y > w.h + b.r * 3)) return false;
    if (b.kind === "eagle" || b.mode === "fall" || b.mode === "stunned") return true;
    if (b.id === s.carrier) return true;
    return !exitEdge(b, w);
  });
  if (wasActive && !s.birds.length) s.nextWave = 4 + rng() * 4;
  return returned;
}

function canBeStunned(b: Bird) {
  return b.mode !== "fall" && b.mode !== "stunned" && b.mode !== "outside" && b.mode !== "carry" && b.mode !== "frozen" && b.mode !== "absorbing" && b.mode !== "shattered";
}
/** Birds already inside the collision radius drop once. Empty scenes add nothing. */
export function rainDropBirds(s: BirdState, ball: { x: number; y: number; r: number }) {
  let dropped = 0;
  for (const b of s.birds) {
    if (Math.hypot(b.x - ball.x, b.y - ball.y) > b.r + ball.r) continue;
    if (b.mode === "carry" && s.carrier === b.id) {
      if (releaseBirdCarrier(s)) dropped += 1;
      continue;
    }
    if (!canBeStunned(b) || b.rewarded) continue;
    stunBird(s, b);
    b.rewarded = true;
    dropped += 1;
  }
  return dropped;
}

/** A skill interrupts the carrying pair before ordinary collision immunity resumes. */
export function releaseBirdCarrier(s: BirdState) {
  const b = s.birds.find(b => b.id === s.carrier);
  if (!b) return false;
  s.carrier = null; s.safeLeft = 0.4;
  setMode(b, "fly"); stunBird(s, b); b.rewarded = true;
  return true;
}
function shatterBird(s: BirdState, b: Bird) {
  if (b.mode !== "frozen") return;
  setMode(b, "shattered"); s.iceBreaks++; b.rewarded = true;
}
/** Frozen birds are solid falling ice, shattered by the train, boards or signals. */
export function collideFrozenBirds(s: BirdState, boxes: Array<{ x: number; y: number; w: number; h: number; shift?: number }>, segments: Array<{ x0: number; y0: number; x1: number; y1: number; halfW: number }> = []) {
  for (const b of s.birds) {
    if (b.mode !== "frozen" || b.modeTime <= 0) continue;
    for (const box of boxes) {
      const shift = box.shift ?? 0;
      if (sweepGantryCircle(b.px, b.py, b.x - b.px + shift, b.y - b.py, b.r * 1.35,
        { ...box, x: box.x + shift, kind: "beam" })) { shatterBird(s, b); break; }
    }
    if (b.mode !== "frozen") continue;
    for (const line of segments) {
      const dx = line.x1 - line.x0, dy = line.y1 - line.y0, length = Math.hypot(dx, dy);
      if (!length) continue;
      const c = dx / length, sn = dy / length;
      const px = b.px - line.x0, py = b.py - line.y0, mx = b.x - b.px, my = b.y - b.py;
      if (sweepGantryCircle(px * c + py * sn, py * c - px * sn, mx * c + my * sn, my * c - mx * sn, b.r * 1.35,
        { x: 0, y: -line.halfW, w: length, h: line.halfW * 2, kind: "beam" })) { shatterBird(s, b); break; }
    }
  }
}
function stunBird(s: BirdState, b: Bird) {
  if (!canBeStunned(b)) return;
  setMode(b, "stunned"); b.flightVx = 0; b.vx = 0 - s.trainSpeed; b.vy = 0;
  b.hiddenByCloud = false; s.kills++;
}
function birdAngle(b: Bird) {
  return b.mode === "fall" ? Math.min(1.3, b.modeTime * 3)
    : b.mode === "stunned" ? 0
    : b.mode === "dive" || b.kind === "dive" ? Math.atan2(b.vy, Math.abs(b.vx)) * b.dir
    : Math.max(-0.22, Math.min(0.22, b.vy / 600)) * b.dir;
}
/** Recovery uses the painted body, head, wings, tail and a small talon zone. */
function collisionParts(b: Bird) {
  const parts = b.kind === "eagle" && b.mode === "climb"
    ? [
      { x: -0.05, y: 0.1, r: 0.66, claw: false },
      { x: 0.59, y: -0.25, r: 0.43, claw: false },
      { x: -1.18, y: -0.65, r: 0.6, claw: false },
      { x: 0.8, y: -0.65, r: 0.48, claw: false },
      { x: -1.18, y: 0.15, r: 0.32, claw: false },
      { x: 0.04, y: 0.8, r: 0.3, claw: true },
    ] : [{ x: 0, y: 0, r: 1, claw: false }];
  const angle = birdAngle(b), cos = Math.cos(angle), sin = Math.sin(angle);
  return parts.map(p => ({
    x: (p.x * b.dir * cos - p.y * sin) * b.r,
    y: (p.x * b.dir * sin + p.y * cos) * b.r,
    r: p.r * b.r, claw: p.claw,
  }));
}

/** Only gantries and the basketball can stun a bird; carrying pairs stay immune. */
export function collideBirdGantries(s: BirdState, gantries: TrainGantry[], scrollDelta: number) {
  const before = s.kills;
  for (const b of s.birds) {
    if (!canBeStunned(b)) continue;
    const dx = b.x - b.px + scrollDelta, dy = b.y - b.py;
    let hit: ReturnType<typeof sweepGantryCircle> = null;
    for (const part of collisionParts(b)) for (const gantry of gantries) for (const rect of gantry.rects) {
      const found = sweepGantryCircle(b.px + part.x, b.py + part.y, dx, dy, part.r, { ...rect, x: rect.x + scrollDelta });
      if (found && (!hit || found.t < hit.t)) hit = found;
    }
    if (!hit) continue;
    b.x = b.px + dx * hit.t - scrollDelta;
    b.y = b.py + dy * hit.t;
    stunBird(s, b);
  }
  return s.kills - before;
}

/** Relative swept circles catch even a fast dive crossing the ball between frames. */
export function collideBirds(s: BirdState, ball: Body, prevX: number, prevY: number, skills: BirdSkills = {}, rng = Math.random) {
  if (birdOwnsBall(s) || s.safeLeft > 0 || skills.unobservable || skills.hole) return null;
  let nearest: { bird: Bird; t: number; nx: number; ny: number; x: number; y: number; r: number; claw: boolean } | null = null;
  for (const b of s.birds) {
    if (!canBeStunned(b) && b.mode !== "frozen") continue;
    for (const part of collisionParts(b)) {
      const x = prevX - b.px - part.x, y = prevY - b.py - part.y, r = ball.r + part.r;
      const dx = ball.x - prevX - (b.x - b.px), dy = ball.y - prevY - (b.y - b.py);
      const a = dx * dx + dy * dy, c = x * x + y * y - r * r;
      let t = 0;
      if (c > 0) {
        const bb = 2 * (x * dx + y * dy), disc = bb * bb - 4 * a * c;
        if (a < 1e-8 || disc < 0) continue;
        t = (-bb - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t > 1) continue;
      }
      const hitX = x + dx * t, hitY = y + dy * t, len = Math.hypot(hitX, hitY);
      const rvx = ball.vx - b.vx, rvy = ball.vy - b.vy, speed = Math.hypot(rvx, rvy);
      // Overlapping centers still need a separation normal and a real rebound.
      const nx = len > 1e-8 ? hitX / len : speed > 1e-8 ? -rvx / speed : 0;
      const ny = len > 1e-8 ? hitY / len : speed > 1e-8 ? -rvy / speed : -1;
      if (!nearest || t < nearest.t) nearest = { bird: b, t, nx, ny,
        x: b.x + part.x, y: b.y + part.y, r: part.r, claw: part.claw };
    }
  }
  if (!nearest) return null;
  const { bird: b, nx, ny } = nearest;
  skills.contact?.(Math.max(0, -((ball.vx - b.vx) * nx + (ball.vy - b.vy) * ny)), Math.hypot(ball.x - nearest.x, ball.y - nearest.y));
  const stomp = b.kind === "eagle" && ny < -0.45 && ball.vy > 0 && ball.vy - b.vy > 0;
  if (b.mode === "frozen") {
    shatterBird(s, b);
    const vn = (ball.vx - b.vx) * nx + (ball.vy - b.vy) * ny;
    if (vn < 0) { ball.vx -= 1.5 * vn * nx; ball.vy -= 1.5 * vn * ny; }
    return "shattered" as const;
  }
  const catching = b.kind === "eagle" && !stomp && !(b.mode === "climb" && !nearest.claw);
  if (skills.lethal || skills.burn || skills.block?.(catching, nx, ny)) {
    b.burnt = Boolean(skills.burn); stunBird(s, b); b.rewarded = true;
    return "knockdown" as const;
  }
  if ((skills.frostChance ?? 0) > 0 && rng() < skills.frostChance!) {
    setMode(b, "frozen"); b.hiddenByCloud = false; b.flightVx = 0; b.vx = -s.trainSpeed; b.vy = 0;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) { ball.vx -= 1.5 * vn * nx; ball.vy -= 1.5 * vn * ny; }
    ball.x = nearest.x + nx * (ball.r + nearest.r + 1);
    ball.y = nearest.y + ny * (ball.r + nearest.r + 1);
    return "frozen" as const;
  }
  if (b.kind !== "eagle" || stomp || (b.mode === "climb" && !nearest.claw)) {
    let vn = (ball.vx - b.vx) * nx + (ball.vy - b.vy) * ny;
    // A stunned silly bird stops in world space: a ball overtaking it must bounce
    // away too, rather than continue through it at a slightly reduced speed.
    if (b.kind === "silly") vn = Math.min(vn, (ball.vx + s.trainSpeed) * nx + ball.vy * ny);
    const restitution = b.kind === "silly" ? 1.65 : 1.35;
    if (vn < 0) { ball.vx -= restitution * vn * nx; ball.vy -= restitution * vn * ny; }
    ball.x = nearest.x + nx * (ball.r + nearest.r + 0.5);
    ball.y = nearest.y + ny * (ball.r + nearest.r + 0.5);
    if (b.kind === "dive") {
      // Transfer the dive's direction, including its motion relative to the train.
      const length = Math.hypot(b.vx, b.vy) || 1;
      const speed = Math.max(ball.r * 30, length * 1.2);
      ball.vx = b.vx / length * speed; ball.vy = b.vy / length * speed;
    }
    if (stomp) ball.vy = -Math.max(160, Math.abs(ball.vy));
    stunBird(s, b);
    b.rewarded = true;
    return "knockdown" as const;
  }
  s.carrier = b.id; s.catches++; b.hiddenByCloud = false;
  setMode(b, "carry");
  b.launchTrainSpeed = s.trainSpeed;
  if (b.kind === "eagle") b.dir = Math.sign(b.vx) || b.dir;
  cling(b, ball);
  return "caught" as const;
}

export function birdBehindCloud(b: Bird, h: number) {
  return b.kind === "eagle" && b.mode === "patrol" && b.hiddenByCloud && b.y < h * 0.3;
}

/** Painted parts share one pivot. Wings animate continuously; no sprite-cell jitter. */
export function drawBirds(ctx: CanvasRenderingContext2D, s: BirdState, h: number, layer: "cloud" | "world" | "carried", cloudsOn = true) {
  for (const b of s.birds) {
    if (b.mode === "outside") continue;
    const carried = b.id === s.carrier, cloud = cloudsOn && birdBehindCloud(b, h);
    if (layer === "carried" ? !carried : carried || (layer === "cloud" ? !cloud : cloud)) continue;
    drawBird(ctx, b);
  }
}
export function eagleWarningLit(b: Bird) {
  return b.mode === "warning" && Math.floor(b.modeTime * 10) % 2 === 0;
}
/** Foreground overlay keeps the half-second tell visible above clouds and HUD art. */
export function drawEagleWarnings(ctx: CanvasRenderingContext2D, s: BirdState) {
  for (const b of s.birds) {
    if (!eagleWarningLit(b)) continue;
    ctx.save(); ctx.translate(b.x + b.dir * b.r * 0.6, Math.max(b.r, b.y - b.r * 2.1));
    ctx.fillStyle = "#ffd43c"; ctx.strokeStyle = "#202a2b"; ctx.lineWidth = b.r * 0.16;
    ctx.lineJoin = "round";
    ctx.beginPath(); ctx.rect(-b.r * 0.13, -b.r * 0.62, b.r * 0.26, b.r * 0.78); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, b.r * 0.45, b.r * 0.14, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
    ctx.restore();
  }
}
export function drawBird(ctx: CanvasRenderingContext2D, b: Bird) {
  ctx.save(); ctx.translate(b.x, b.y);
  if (b.mode === "shattered") {
    ctx.globalAlpha = Math.max(0, 1 - b.modeTime / 0.45);
    ctx.fillStyle = "#c2f4ff"; ctx.strokeStyle = "#62bcdc";
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7, t = b.modeTime;
      const x = Math.cos(a) * b.r * (1 + t * 6), y = Math.sin(a) * b.r * (1 + t * 5) + t * t * 160;
      ctx.beginPath(); ctx.moveTo(x, y - b.r * 0.3); ctx.lineTo(x + b.r * 0.25, y + b.r * 0.2); ctx.lineTo(x - b.r * 0.2, y + b.r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore(); return;
  }
  if ((b.sootLeft ?? 0) > 0) ctx.filter = sootFilter(b.sootLeft);
  if (b.burnt) ctx.filter = "grayscale(1) brightness(0.28)";
  if (b.mode === "absorbing") { const shrink = Math.max(0.12, 1 - b.modeTime * 0.65); ctx.scale(shrink, shrink); ctx.rotate(b.modeTime * 7); }
  const stunned = b.mode === "stunned" || b.mode === "fall" || b.mode === "frozen";
  if (b.mode === "stunned" && Math.floor(b.modeTime * 15) % 2 === 1) ctx.globalAlpha *= 0.18;
  ctx.rotate(birdAngle(b)); ctx.scale(b.dir * b.r, b.r);
  ctx.lineWidth = 0.075; ctx.lineJoin = "round"; ctx.strokeStyle = "#202a2b";
  const eagle = b.kind === "eagle", silly = b.kind === "silly";
  const back = eagle ? "#67462f" : silly ? "#698a60" : "#3e6474";
  const light = eagle ? "#c59a61" : silly ? "#d9b866" : "#96bfba";
  const wing = (far: boolean) => {
    const open = eagle && b.mode !== "dive" && !stunned;
    const flap = stunned ? 0.85 : eagle && b.mode === "dive" ? -0.7 : Math.sin(b.flap) * 0.95;
    ctx.save(); ctx.translate(-0.16, -0.15);
    if (open) {
      // Broad, outstretched primaries on both sides when soaring or lifting a catch.
      ctx.scale(far ? -0.9 : 1.2, far ? 0.85 : 1.05);
      ctx.rotate(0.12 + Math.sin(b.flap * 0.35) * 0.06);
    } else ctx.rotate((far ? 0.3 : -0.1) + flap);
    ctx.fillStyle = far ? "#39463c" : back;
    ctx.beginPath(); ctx.moveTo(0.35, 0.12); ctx.quadraticCurveTo(-0.2, -0.8, -1.45, -0.95);
    for (let i = 0; i < 5; i++) { const x = -1.45 + i * 0.24; ctx.lineTo(x, -0.48 + i * 0.12); ctx.lineTo(x + 0.09, -0.72 + i * 0.1); }
    ctx.lineTo(0.3, 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = 0.055;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-0.15, -0.18); ctx.lineTo(-1.2 + i * 0.25, -0.55 + i * 0.1); ctx.stroke(); }
    ctx.restore();
  };
  wing(true);
  ctx.fillStyle = back;
  ctx.beginPath(); ctx.moveTo(-0.65, 0); ctx.lineTo(-1.5, -0.2); ctx.lineTo(-1.23, 0.18); ctx.lineTo(-1.4, 0.4); ctx.lineTo(-0.55, 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-0.05, 0.1, 0.86, silly ? 0.67 : 0.5, -0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = silly ? "#f2df97" : "#dbd7bc";
  ctx.beginPath(); ctx.ellipse(0.17, 0.32, 0.55, 0.3, -0.1, 0, Math.PI * 2); ctx.fill();
  wing(false);
  ctx.fillStyle = eagle ? "#eee7cb" : back;
  ctx.beginPath(); ctx.ellipse(0.59, -0.25, 0.43, 0.44, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e8b450";
  ctx.beginPath(); ctx.moveTo(0.91, -0.28); ctx.lineTo(1.33, -0.06); ctx.lineTo(eagle ? 1.12 : 0.91, eagle ? 0.2 : 0.1); ctx.lineTo(0.92, 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff8de"; ctx.beginPath(); ctx.ellipse(0.72, -0.35, silly ? 0.19 : 0.13, silly ? 0.22 : 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#182325";
  if (stunned) {
    ctx.beginPath(); ctx.moveTo(0.61, -0.45); ctx.lineTo(0.81, -0.25); ctx.moveTo(0.81, -0.45); ctx.lineTo(0.61, -0.25); ctx.stroke();
  } else { ctx.beginPath(); ctx.arc(0.77, -0.34, 0.075, 0, Math.PI * 2); ctx.fill(); }
  if (eagle) { ctx.beginPath(); ctx.moveTo(0.48, -0.55); ctx.lineTo(0.91, -0.43); ctx.stroke(); }
  ctx.strokeStyle = "#d6a047"; ctx.lineWidth = 0.085;
  for (const x of [-0.2, 0.25]) { ctx.beginPath(); ctx.moveTo(x, 0.51); ctx.lineTo(x - 0.04, 0.78); ctx.lineTo(x + 0.16, 0.83); ctx.stroke(); }
  if (b.mode === "frozen") {
    ctx.fillStyle = "#91dfff99"; ctx.strokeStyle = "#d7faff"; ctx.lineWidth = 0.1;
    ctx.beginPath(); ctx.moveTo(-1.5, -1.1); ctx.lineTo(1.3, -1.1); ctx.lineTo(1.5, -0.85); ctx.lineTo(1.4, 1.05); ctx.lineTo(-1.35, 1.15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.1, -0.7); ctx.lineTo(-0.55, -0.95); ctx.moveTo(0.75, 0.9); ctx.lineTo(1.2, 0.55); ctx.stroke();
  }
  ctx.restore();
}
