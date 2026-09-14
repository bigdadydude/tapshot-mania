import type { AiHoop, AiWorld, FlightGuess } from "./types.ts";

const SIM_DT = 1 / 90;
const SIM_STEPS = 240;

function tapVelocity(world: AiWorld): { vx: number; vy: number } {
  if (world.holeOn) {
    const dx = world.hoop.x - world.ball.x;
    const dy = world.hoop.y - world.ball.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(world.jumpVx, Math.abs(world.jumpVy));
    return { vx: (dx / d) * speed, vy: (dy / d) * speed };
  }
  return { vx: world.jumpVx, vy: world.jumpVy };
}

function inHole(h: AiHoop, x: number, y: number, r: number, slack = 0) {
  const openR = h.inner - r * 0.1 + slack;
  return Math.abs(x - h.x) < openR && y + r * 0.18 < h.y;
}

function rimGraze(h: AiHoop, x: number, y: number, r: number) {
  const rad = h.tube * 0.92 + r;
  const left = Math.hypot(x - (h.x - h.inner), y - h.y);
  const right = Math.hypot(x - (h.x + h.inner), y - h.y);
  return left < rad || right < rad;
}

function planeScore(
  h: AiHoop,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
  vy: number,
  r: number,
  overRim: boolean,
  bothWays: boolean,
): { scored: boolean; overRim: boolean } {
  const slack = Math.max(0, (r < 16 ? (16 - r) * 0.45 : 0));
  const openR = h.inner - r * 0.1 + slack;
  const inNow = Math.abs(x - h.x) < openR;
  let over = overRim;
  if (inNow && (y + r * 0.18 < h.y || prevY + r * 0.18 < h.y)) over = true;

  const crossedDown = prevY < h.y && y >= h.y && vy > 4;
  const crossedUp = prevY > h.y && y <= h.y && vy < -4;
  if (crossedDown || (bothWays && crossedUp)) {
    const dy = y - prevY;
    const t = Math.abs(dy) < 1e-6 ? 1 : (h.y - prevY) / dy;
    const xAt = prevX + (x - prevX) * Math.max(0, Math.min(1, t));
    if (Math.abs(xAt - h.x) < h.inner + slack + r * 0.12) {
      return { scored: true, overRim: true };
    }
  }

  if (over && vy > 8 && y >= h.y && inNow) return { scored: true, overRim: over };
  if (bothWays && inNow && vy < -8 && y <= h.y && prevY > h.y) {
    return { scored: true, overRim: true };
  }
  return { scored: false, overRim: over };
}

function wrapFlight(world: AiWorld, x: number, vx: number): { x: number; vx: number; grounded: boolean } {
  const r = world.ball.r;
  const pad = world.wrapPad;
  const exit = x < -r - pad || x > world.world.w + r + pad;
  if (!exit) return { x, vx, grounded: false };
  if (world.kit.wrap === "height") {
    const spd = Math.max(44, Math.abs(vx));
    if (world.hoop.side > 0) return { x: -r - pad * 0.5, vx: spd, grounded: false };
    return { x: world.world.w + r + pad * 0.5, vx: -spd, grounded: false };
  }
  return { x, vx, grounded: true };
}

function guess(over: Partial<FlightGuess> & Pick<FlightGuess, "minHoopDist" | "collectedAnti" | "minAntiDist">): FlightGuess {
  return {
    scores: false,
    swish: false,
    bank: false,
    hitFloor: false,
    ...over,
  };
}

/**
 * Court-facing backboard plane — same visW / gap / topLen ratios as `boardGeom`.
 * Cheap bounce so policies can choose 擦板 when a direct thread is a miss.
 */
function boardFace(h: AiHoop, worldW: number, worldH: number) {
  const visW = Math.max(10, worldW * 0.052 * (2 / 3));
  const gap = Math.max(10, h.inner * 0.48);
  const innerEdge = h.side < 0 ? h.x - h.inner - gap : h.x + h.inner + gap;
  const visX = h.side < 0 ? innerEdge - visW : innerEdge;
  const visY = h.y - worldH * 0.182;
  const bh = worldH * 0.22;
  const faceX = h.side < 0 ? visX + visW : visX;
  const nx = h.side < 0 ? 1 : -1;
  return { faceX, visY, visBottom: visY + bh, nx };
}

function bounceBoard(
  h: AiHoop,
  world: AiWorld,
  prevX: number,
  x: number,
  y: number,
  vx: number,
  r: number,
): { x: number; vx: number } | null {
  const b = boardFace(h, world.world.w, world.world.h);
  if (y + r < b.visY || y - r > b.visBottom) return null;
  const crossed = (prevX - b.faceX) * (x - b.faceX) <= 0;
  const overlapping = Math.abs(x - b.faceX) < r;
  if (!crossed && !overlapping) return null;
  const vn = vx * b.nx;
  if (vn >= 0) return null;
  const rest = Math.min(0.95, Math.max(0, 0.76 * world.ballMul));
  vx -= (1 + rest) * vn * b.nx;
  x = b.faceX + b.nx * (r + 0.5);
  return { x, vx };
}

/**
 * Cheap kinematic guess using the same jump / air / fallBoost terms as the engine.
 * Not a full physics fork — rim/net/board are approximated so policies can vote.
 */
export function simulateFlight(world: AiWorld, vx0: number, vy0: number): FlightGuess {
  const floor = world.world.floorY - world.ball.r;
  let x = world.ball.x;
  let y = world.ball.y;
  let vx = vx0;
  let vy = vy0;
  let prevX = x;
  let prevY = y;
  let overMain = inHole(world.hoop, x, y, world.ball.r);
  let overOther = world.other ? inHole(world.other, x, y, world.ball.r) : false;
  let grazed = false;
  let banked = false;
  let boardHits = 0;
  let minHoop = Math.hypot(x - world.hoop.x, y - world.hoop.y);
  let minAnti = world.antiMatter
    ? Math.hypot(x - world.antiMatter.x, y - world.antiMatter.y)
    : Infinity;
  let collectedAnti = false;
  const bothWays = world.holeOn;
  const skipFallBoost = world.ballMul > 1.15 || world.holeOn;
  const stats = { minHoopDist: minHoop, collectedAnti, minAntiDist: minAnti };

  for (let i = 0; i < SIM_STEPS; i++) {
    const fallBoost = skipFallBoost ? 1 : vy > 20 ? 1.28 : 1;
    if (world.holeOn && world.hole) {
      const dx = world.hole.x - x;
      const dy = world.hole.y - y;
      const d = Math.max(40, Math.hypot(dx, dy));
      const g = world.gravity * 0.72;
      vx += (dx / d) * g * SIM_DT;
      vy += (dy / d) * g * SIM_DT;
      const rd = d;
      const near = Math.min(1, (world.world.w * 0.28) / rd);
      const orbit = g * 0.18 * near;
      vx += (dy / rd) * orbit * SIM_DT;
      vy += (-dx / rd) * orbit * SIM_DT;
    } else {
      vy += world.gravity * SIM_DT * (fallBoost - world.buoy);
    }
    vx *= 1 - Math.min(0.85, 0.035 * world.air * SIM_DT);
    vy *= 1 - Math.min(0.85, 0.025 * world.air * SIM_DT);
    x += vx * SIM_DT;
    y += vy * SIM_DT;

    const wrapped = wrapFlight(world, x, vx);
    if (wrapped.grounded) {
      return guess({ ...stats, minHoopDist: minHoop, collectedAnti, minAntiDist: minAnti, hitFloor: true });
    }
    x = wrapped.x;
    vx = wrapped.vx;

    if (boardHits < 3) {
      const hit = bounceBoard(world.hoop, world, prevX, x, y, vx, world.ball.r);
      if (hit) {
        x = hit.x;
        vx = hit.vx;
        banked = true;
        boardHits += 1;
      }
    }

    minHoop = Math.min(minHoop, Math.hypot(x - world.hoop.x, y - world.hoop.y));
    if (world.other) {
      minHoop = Math.min(minHoop, Math.hypot(x - world.other.x, y - world.other.y));
    }
    if (world.antiMatter) {
      const ad = Math.hypot(x - world.antiMatter.x, y - world.antiMatter.y);
      minAnti = Math.min(minAnti, ad);
      if (ad < world.ball.r + world.antiMatter.r) collectedAnti = true;
    }
    if (rimGraze(world.hoop, x, y, world.ball.r)) grazed = true;

    const main = planeScore(world.hoop, prevX, prevY, x, y, vy, world.ball.r, overMain, bothWays);
    overMain = main.overRim;
    if (main.scored) {
      return guess({
        scores: true,
        swish: !grazed && !banked,
        bank: banked,
        minHoopDist: minHoop,
        collectedAnti,
        minAntiDist: minAnti,
      });
    }
    // Only a still-live other (frost dual stand) counts. The hoop you just
    // scored on is `other` while it slides off — treating it as a make freezes
    // the AI on the old side.
    const liveOther =
      world.other && (world.other.frostLeft > 0 || world.other.active);
    if (liveOther && world.other) {
      if (rimGraze(world.other, x, y, world.ball.r)) grazed = true;
      const alt = planeScore(world.other, prevX, prevY, x, y, vy, world.ball.r, overOther, bothWays);
      overOther = alt.overRim;
      if (alt.scored) {
        return guess({
          scores: true,
          swish: !grazed && !banked,
          bank: banked,
          minHoopDist: minHoop,
          collectedAnti,
          minAntiDist: minAnti,
        });
      }
    }

    if (y >= floor) {
      return guess({
        hitFloor: true,
        minHoopDist: minHoop,
        collectedAnti,
        minAntiDist: minAnti,
      });
    }
    prevX = x;
    prevY = y;
  }

  return guess({ minHoopDist: minHoop, collectedAnti, minAntiDist: minAnti });
}

export function predictCurrent(world: AiWorld): FlightGuess {
  return simulateFlight(world, world.ball.vx, world.ball.vy);
}

export function predictTap(world: AiWorld): FlightGuess {
  const { vx, vy } = tapVelocity(world);
  return simulateFlight(world, vx, vy);
}

export const aiHelpers = {
  predictCurrent,
  predictTap,
};
