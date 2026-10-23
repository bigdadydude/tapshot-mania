import type { Ball, Hoop, World } from "./types";
import { NET_COLS, NET_ROWS, NET_ROW_H, RIM_RY, netTheta, rowShrink, netRowReleased } from "./net.ts";

/** Shared cloth solver. 篮网2 is the slower swing; 篮网3 is the snappier one. */
export type NetProfile = {
  shapeRestore: number;
  hangAccel: number;
  releasedAccel: number;
  dampRate: number;
  contactResponse: number;
  hitScale: number;
  hitCap: number;
  tugGain: number;
  /** Scales wind and train accel so those nudges stay visible as tension changes. */
  envResponse: number;
  /** Vertical rope pitch. 1 is 篮网2; above 1 lowers the idle hem. */
  rowPitch: number;
};

const RELEASED_ACCEL = 18;

export const NET2_PROFILE: NetProfile = {
  shapeRestore: 16,
  hangAccel: 9,
  releasedAccel: RELEASED_ACCEL,
  dampRate: 4.4,
  contactResponse: 54,
  hitScale: 0.32,
  hitCap: 5.5,
  tugGain: 0.25,
  envResponse: 1,
  rowPitch: 1,
};

const NET3_HANG = 31;
export const NET3_PROFILE: NetProfile = {
  shapeRestore: 56,
  hangAccel: NET3_HANG,
  releasedAccel: RELEASED_ACCEL,
  dampRate: 8.1,
  contactResponse: 120,
  hitScale: 0.59,
  hitCap: 10.2,
  tugGain: 0.46,
  envResponse: NET3_HANG / 9,
  // Idle 篮网3 sat ~0.09×inner above 篮网1. Extra vertical pitch drops the hem to match.
  rowPitch: 1.074,
};

// A sleeve in 3D, projected onto the existing 2D court. Only the rim is pinned.
// Rest geometry and connectivity are shared by the solver and renderer.
const REST = Array.from({ length: NET_COLS * NET_ROWS }, (_, i) => {
  const row = Math.floor(i / NET_COLS), col = i % NET_COLS;
  const angle = netTheta(row, col), radius = rowShrink(row);
  return { x: Math.cos(angle) * radius, y: row * NET_ROW_H, z: Math.sin(angle) * radius, row };
});

type Edge = { a: number; b: number; length: number };
export const NET2_EDGES: readonly Edge[] = REST.flatMap((p, a) => {
  const col = a % NET_COLS;
  const targets = p.row === NET_ROWS - 1
    ? [] // The last diagonal loops are free ends, not a horizontal drawstring.
    : [(p.row + 1) * NET_COLS + col,
      (p.row + 1) * NET_COLS + (col + (p.row % 2 === 0 ? 1 : NET_COLS - 1)) % NET_COLS];
  return targets.map(b => {
    const q = REST[b]!;
    return { a, b, length: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) };
  });
});
const tension = new Float64Array(NET2_EDGES.length);
const rowCenterX = new Float64Array(NET_ROWS);
const rowCenterZ = new Float64Array(NET_ROWS);

export type Net2Environment = {
  horizontalAccel?: number;
  wind?: number;
  motion?: { angle: number; pivotX: number; pivotY: number; accelX: number; accelY: number };
  profile?: NetProfile;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function gust(t: number, seed: number) {
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  };
  const cell = Math.floor(t), f = t - cell, blend = f * f * (3 - 2 * f);
  return hash(cell) * (1 - blend) + hash(cell + 1) * blend;
}

export function net2Depth(h: Hoop, index: number) {
  return h.net[index]?.depth ?? REST[index]!.z * h.inner;
}

function prepare(h: Hoop) {
  // New hoops and snapshots made with the old net can both enter here.
  for (let i = 0; i < h.net.length; i++) {
    const n = h.net[i]!;
    if (n.depth !== undefined) continue;
    n.depth = n.prevDepth = REST[i]!.z * h.inner;
    n.px = n.x;
    n.py = n.y;
    n.netDt = 1 / 120;
  }
  return h.net[0]!.netState ??= {
    clock: 0, seed: (h.baseY ?? h.y) * 0.173 + h.inner * 3.71 + (h.side ?? 1) * 7.13,
    inside: false, exited: false, fromBelow: false, impactUntil: 0,
  };
}

/** Stand recoil opposes the incoming hit; remote support hits lose leverage. */
export function strikeNet2(h: Hoop, x: number, y: number, vx: number, vy: number, impact: number, profile: NetProfile = NET2_PROFILE) {
  const state = prepare(h), speed = Math.hypot(vx, vy);
  if (speed < 1 || impact < h.inner * .6 || state.clock < state.impactUntil) return 0;
  const distance = Math.hypot(x - h.x, y - h.y);
  const attenuation = 1 / (1 + Math.pow(distance / (h.inner * 1.8), 2));
  const strength = Math.min(h.inner * profile.hitCap, (impact - h.inner * .6) * profile.hitScale) * attenuation;
  state.impactUntil = state.clock + .035;
  for (let i = NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!, rest = REST[i]!;
    if (netRowReleased(h.char, rest.row)) continue;
    const weight = .3 + .7 * rest.row / (NET_ROWS - 1);
    n.px += vx / speed * strength * weight * n.netDt!;
    n.py += vy / speed * strength * weight * n.netDt!;
  }
  return strength;
}

/** Inject a local impulse, never reset the cloth's position on a make. */
export function tugNet2(h: Hoop, ball?: Pick<Ball, "x" | "y" | "vx" | "vy">, profile: NetProfile = NET2_PROFILE) {
  // Reverse-direction makes already push the cloth through real contact.
  // Scoring must not attach the sleeve to an ascending ball.
  if (ball && ball.vy <= 0) return;
  const state = prepare(h);
  if (ball) { state.inside = true; state.exited = false; state.fromBelow = false; }
  h.netPulse = 0.7;
  const bx = ball?.x ?? h.x, by = ball?.y ?? h.y;
  const vy = clamp(ball?.vy ?? h.inner * 4, -h.inner * 32, h.inner * 32);
  const vx = clamp(ball?.vx ?? 0, -h.inner * 24, h.inner * 24);
  for (let i = NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!, rest = REST[i]!;
    if (netRowReleased(h.char, rest.row)) continue;
    const distance = Math.hypot(n.x - bx, n.y - by);
    const weight = Math.exp(-Math.pow(distance / (h.inner * 0.85), 2)) * profile.tugGain;
    const dt = n.netDt!;
    n.px -= vx * weight * dt;
    n.py -= vy * weight * dt;
  }
}

function pin(h: Hoop) {
  for (let i = 0; i < NET_COLS; i++) {
    const n = h.net[i]!, p = REST[i]!;
    if (netRowReleased(h.char, 0)) { n.pinned = false; continue; }
    n.pinned = true;
    n.x = n.px = h.x + p.x * h.inner;
    n.y = n.py = h.y;
    n.depth = n.prevDepth = p.z * h.inner;
  }
}

function restSpan(edge: Edge, inner: number, rowPitch: number) {
  if (rowPitch === 1) return edge.length * inner;
  const p = REST[edge.a]!, q = REST[edge.b]!;
  return Math.hypot(q.x - p.x, (q.y - p.y) * rowPitch, q.z - p.z) * inner;
}

function constrain(h: Hoop, dt: number, passes: number, rowPitch = 1) {
  // Knots articulate, but the cord between them cannot disappear under
  // compression. Solve both signs of the length error, with very little stretch.
  const compliance = 0.0000001 / (dt * dt);
  for (let pass = 0; pass < passes; pass++) {
    for (let e = 0; e < NET2_EDGES.length; e++) {
      const edge = NET2_EDGES[e]!;
      const a = h.net[edge.a]!, b = h.net[edge.b]!;
      if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.depth! - a.depth!;
      const length = Math.hypot(dx, dy, dz);
      const restLength = restSpan(edge, h.inner, rowPitch);
      if (length < 1e-6) continue;
      const wa = a.pinned ? 0 : 1, wb = b.pinned ? 0 : 1;
      if (wa + wb === 0) continue;
      const old = tension[e]!;
      const next = old + (-(length - restLength) - compliance * old) / (wa + wb + compliance);
      tension[e] = next;
      const correction = -(next - old) / length;
      a.x += dx * correction * wa;
      a.y += dy * correction * wa;
      a.depth! += dz * correction * wa;
      b.x -= dx * correction * wb;
      b.y -= dy * correction * wb;
      b.depth! -= dz * correction * wb;
      // Position correction carries no impulse. Velocities are constrained
      // separately, so opening a diamond cannot kick the whole net upward.
      a.px += dx * correction * wa;
      a.py += dy * correction * wa;
      a.prevDepth! += dz * correction * wa;
      b.px -= dx * correction * wb;
      b.py -= dy * correction * wb;
      b.prevDepth! -= dz * correction * wb;
    }
  }
}

/** Remove stretching velocity while retaining each cord's transverse swing. */
function constrainVelocity(h: Hoop) {
  for (let pass = 0; pass < 4; pass++) for (const edge of NET2_EDGES) {
    if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
    const a = h.net[edge.a]!, b = h.net[edge.b]!;
    const wa = a.pinned ? 0 : 1, wb = b.pinned ? 0 : 1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.depth! - a.depth!;
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < 1e-8 || wa + wb === 0) continue;
    const relative = ((b.x - b.px - a.x + a.px) * dx
      + (b.y - b.py - a.y + a.py) * dy
      + (b.depth! - b.prevDepth! - a.depth! + a.prevDepth!) * dz) / (sq * (wa + wb));
    a.px -= dx * relative * wa; a.py -= dy * relative * wa; a.prevDepth! -= dz * relative * wa;
    b.px += dx * relative * wb; b.py += dy * relative * wb; b.prevDepth! += dz * relative * wb;
  }
}

// Only an overlapping strand is displaced. On the upper hemisphere an upward
// ball first lifts the strand; it can slip outward as it reaches the equator.
function spherePush(dx: number, dy: number, dz: number, radius: number, upward: boolean) {
  const fold = upward ? clamp(-dy / radius * .8, 0, .65) : 0;
  let nx = dx, ny = dy, nz = dz;
  const normal = Math.hypot(nx, ny, nz) || 1;
  nx = nx / normal * (1 - fold);
  ny = ny / normal * (1 - fold) - fold;
  nz = nz / normal * (1 - fold);
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  const dot = dx * nx + dy * ny + dz * nz;
  const push = -dot + Math.sqrt(Math.max(0, dot * dot + radius * radius - dx * dx - dy * dy - dz * dz));
  return { nx, ny, nz, push };
}

function contact(h: Hoop, ball: Ball, fromX: number, fromY: number, bx: number, by: number, dt: number, profile: NetProfile) {
  const dxPath = bx - fromX, dyPath = by - fromY;
  const pathSq = dxPath * dxPath + dyPath * dyPath;
  const radius = ball.r * 1.025;
  let contacts = 0;
  for (let i = NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!, rest = REST[i]!;
    if (netRowReleased(h.char, rest.row)) continue;
    // Closest point on the swept sphere's path also catches fast pass-throughs.
    const t = pathSq > 1e-8
      ? Math.max(0, Math.min(1, ((n.x - fromX) * dxPath + (n.y - fromY) * dyPath) / pathSq)) : 1;
    const cx = fromX + dxPath * t, cy = fromY + dyPath * t;
    let dx = n.x - cx, dy = n.y - cy, dz = n.depth!;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq >= radius * radius) continue;
    const d = Math.sqrt(distanceSq);
    contacts++;
    if (d < 1e-6) { dx = rest.x; dy = 0; dz = rest.z; }
    const { nx, ny, nz, push } = spherePush(dx, dy, dz, radius, ball.vy < 0);
    // Displacement does not become a spurious velocity explosion.
    n.x += nx * push; n.px += nx * push;
    n.y += ny * push; n.py += ny * push;
    n.depth! += nz * push; n.prevDepth! += nz * push;
    let vx = (n.x - n.px) / dt, vy = (n.y - n.py) / dt, vz = (n.depth! - n.prevDepth!) / dt;
    const ballVx = clamp(ball.vx, -h.inner * 36, h.inner * 36);
    const ballVy = clamp(ball.vy, -h.inner * 36, h.inner * 36);
    const relativeNormal = (ballVx - vx) * nx + (ballVy - vy) * ny - vz * nz;
    // One-sided pressure and Coulomb friction: a separating ball cannot pull
    // the net after itself, and friction cannot exist without contact pressure.
    const pressure = Math.max(0, relativeNormal) * (1 - Math.exp(-profile.contactResponse * dt));
    const tx = ballVx - vx - relativeNormal * nx;
    const ty = ballVy - vy - relativeNormal * ny;
    const tz = -vz - relativeNormal * nz;
    const normalLoad = ball.vy < 0 && relativeNormal <= 0 ? 0
      : pressure + Math.min(h.inner * 8, push / dt);
    const drag = Math.min(1 - Math.exp(-30 * dt), normalLoad * .4 / (Math.hypot(tx, ty, tz) || 1));
    vx += nx * pressure + tx * drag;
    vy += ny * pressure + ty * drag;
    vz += nz * pressure + tz * drag;
    n.px = n.x - vx * dt;
    n.py = n.y - vy * dt;
    n.prevDepth = n.depth! - vz * dt;
  }
  return contacts;
}

/** Resolve rope segments too: their endpoints can clear the ball while the rope cuts through it. */
function contactEdges(h: Hoop, bx: number, by: number, radius: number, upward: boolean) {
  let contacts = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const edge of NET2_EDGES) {
      if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
      const a = h.net[edge.a]!, b = h.net[edge.b]!;
      if (Math.min(a.x, b.x) > bx + radius || Math.max(a.x, b.x) < bx - radius ||
        Math.min(a.y, b.y) > by + radius || Math.max(a.y, b.y) < by - radius ||
        Math.min(a.depth!, b.depth!) > radius || Math.max(a.depth!, b.depth!) < -radius) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.depth! - a.depth!;
      const sq = dx * dx + dy * dy + dz * dz;
      const t = sq > 1e-8 ? clamp(((bx - a.x) * dx + (by - a.y) * dy - a.depth! * dz) / sq, 0, 1) : 0;
      let nx = a.x + dx * t - bx, ny = a.y + dy * t - by, nz = a.depth! + dz * t;
      const d = Math.hypot(nx, ny, nz);
      if (d >= radius) continue;
      const wa = a.pinned ? 0 : 1 - t, wb = b.pinned ? 0 : t;
      const sum = wa * (1 - t) + wb * t;
      if (sum < 1e-6) continue;
      if (Math.hypot(nx, nz) < 1e-6) { nx = REST[edge.a]!.x * .001; nz = REST[edge.a]!.z * .001; }
      const response = spherePush(nx, ny, nz, radius, upward);
      ({ nx, ny, nz } = response);
      const push = response.push;
      const k = Math.min(push / sum, radius * 0.8);
      a.x += nx * k * wa; a.px += nx * k * wa;
      a.y += ny * k * wa; a.py += ny * k * wa;
      a.depth! += nz * k * wa; a.prevDepth! += nz * k * wa;
      b.x += nx * k * wb; b.px += nx * k * wb;
      b.y += ny * k * wb; b.py += ny * k * wb;
      b.depth! += nz * k * wb; b.prevDepth! += nz * k * wb;
      contacts++;
    }
  }
  return contacts;
}

function hemHeight(h: Hoop) {
  let y = -Infinity;
  for (let i = (NET_ROWS - 1) * NET_COLS; i < h.net.length; i++) y = Math.max(y, h.net[i]!.y);
  return y;
}

function sideAt(h: Hoop, y: number, left: boolean) {
  const u = clamp((y - h.y) / (h.inner * NET_ROW_H), 0, NET_ROWS - 1);
  const row = Math.min(NET_ROWS - 2, Math.floor(u)), t = u - row;
  const extent = (r: number) => {
    let v = left ? Infinity : -Infinity;
    for (let c = 0; c < NET_COLS; c++) v = left ? Math.min(v, h.net[r * NET_COLS + c]!.x) : Math.max(v, h.net[r * NET_COLS + c]!.x);
    return v;
  };
  return extent(row) * (1 - t) + extent(row + 1) * t;
}

/** Side-column knot: the woven wall, not the front or back lip of an opening. */
function sideKnot(index: number) {
  const rest = REST[index]!;
  return Math.abs(rest.x) >= Math.abs(rest.z);
}

/**
 * Left and right side walls in the plane the player sees.
 * Both columns have to be in range. A lone hem-lip knot is the mouth, not a wall.
 */
function screenWalls(h: Hoop, y: number, reach: number) {
  let left = Infinity, right = -Infinity;
  for (let i = 0; i < h.net.length; i++) {
    if (!sideKnot(i)) continue;
    const n = h.net[i]!;
    if (netRowReleased(h.char, REST[i]!.row)) continue;
    const sy = n.y + n.depth! * RIM_RY;
    if (sy < y - reach || sy > y + reach) continue;
    left = Math.min(left, n.x);
    right = Math.max(right, n.x);
  }
  if (!(left < h.x && right > h.x)) return null;
  return { left, right };
}

function hemScreen(h: Hoop) {
  let y = -Infinity;
  for (let i = (NET_ROWS - 1) * NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!;
    y = Math.max(y, n.y + n.depth! * RIM_RY);
  }
  return y;
}

export function stepNet2(h: Hoop, ball: Ball, prevX: number, prevY: number, _world: World,
  dt: number, _time: number, allowContact: boolean, env: Net2Environment = {}) {
  if (!(dt > 0) || !h.net.length) return;
  const profile = env.profile ?? NET2_PROFILE;
  const state = prepare(h);
  const canTouch = allowContact && !(h.burning && h.char > 0.45);
  if (!canTouch) { state.inside = false; state.fromBelow = false; }
  h.netPulse = Math.max(0, h.netPulse - dt);
  const total = Math.min(dt, 1 / 15);
  const motion = env.motion;
  const angle = motion?.angle ?? 0, cos = Math.cos(angle), sin = Math.sin(angle);
  const pivotX = motion?.pivotX ?? h.x, pivotY = motion?.pivotY ?? h.y;
  const toX = (x: number, y: number) => pivotX + (x - pivotX) * cos + (y - pivotY) * sin;
  const toY = (x: number, y: number) => pivotY - (x - pivotX) * sin + (y - pivotY) * cos;
  const body = { ...ball, x: toX(ball.x, ball.y), y: toY(ball.x, ball.y),
    vx: ball.vx * cos + ball.vy * sin, vy: -ball.vx * sin + ball.vy * cos };
  if (body.vy < 0) state.inside = false;
  let bx = toX(prevX, prevY), by = toY(prevX, prevY);
  const travel = Math.hypot(body.x - bx, body.y - by);
  const steps = Math.min(96, Math.max(1, Math.ceil(total * 240),
    canTouch ? Math.ceil(travel / Math.max(2, ball.r * 0.28)) : 1));
  const tick = total / steps;
  let moveX = (body.x - bx) / steps;
  const moveY = (body.y - by) / steps;
  let corrected = false, frictionTime = 0;
  const damping = Math.exp(-profile.dampRate * tick);
  for (let step = 0; step < steps; step++) {
    state.clock += tick;
    const wind = (env.wind ?? 1) * (gust(state.clock * .55, state.seed) + .25 * gust(state.clock * 1.3, state.seed + 7));
    // Unproject for physical distances; project again before returning to the game.
    for (const n of h.net) {
      n.y -= n.depth! * RIM_RY;
      n.py -= n.prevDepth! * RIM_RY;
    }
    pin(h);
    // Preserve the local weave around each moving row, rather than springing
    // every knot toward a world-space pose (which looked like mesh scaling).
    for (let row = 0; row < NET_ROWS; row++) {
      let x = 0, z = 0;
      for (let col = 0; col < NET_COLS; col++) {
        const n = h.net[row * NET_COLS + col]!; x += n.x; z += n.depth!;
      }
      rowCenterX[row] = x / NET_COLS; rowCenterZ[row] = z / NET_COLS;
    }
    for (let i = 0; i < h.net.length; i++) {
      const n = h.net[i]!, rest = REST[i]!;
      const released = netRowReleased(h.char, rest.row);
      if (released) n.pinned = false;
      if (n.pinned) continue;
      const ratio = tick / n.netDt!;
      let vx = (n.x - n.px) * ratio * damping;
      let vy = (n.y - n.py) * ratio * damping;
      let vz = (n.depth! - n.prevDepth!) * ratio * damping;
      const speed = Math.hypot(vx, vy, vz);
      const limit = h.inner * 18 * tick;
      if (speed > limit) { vx *= limit / speed; vy *= limit / speed; vz *= limit / speed; }
      n.px = n.x; n.py = n.y; n.prevDepth = n.depth;
      const memory = released ? 0 : profile.shapeRestore;
      const lower = Math.pow(rest.row / (NET_ROWS - 1), 2);
      const envScale = profile.envResponse;
      const ax = released ? 0 : clamp(((env.horizontalAccel ?? 0) + (motion?.accelX ?? 0) * 1.6) * envScale, -h.inner * 55 * envScale, h.inner * 55 * envScale);
      const ay = released ? 0 : clamp((motion?.accelY ?? 0) * 1.6 * envScale, -h.inner * 55 * envScale, h.inner * 55 * envScale);
      n.x += vx + ((rowCenterX[rest.row]! + rest.x * h.inner - n.x) * memory
        + ax + (released ? 0 : wind * h.inner * 1.2 * envScale * lower)) * tick * tick;
      n.y += vy + (h.inner * (released ? profile.releasedAccel : profile.hangAccel) + ay) * tick * tick;
      n.depth! += vz + ((rowCenterZ[rest.row]! + rest.z * h.inner - n.depth!) * memory
        + (released ? 0 : wind * h.inner * .35 * envScale * lower)) * tick * tick;
      n.netDt = tick;
    }
    tension.fill(0);
    constrain(h, tick, 10, profile.rowPitch);
    const fromX = bx, fromY = by;
    bx += moveX; by += moveY;
    if (canTouch) {
      const bottom = hemHeight(h);
      const crossesTop = fromY < h.y && by >= h.y;
      // Capture the first underside contact, not the center crossing a hem that
      // is already moving upward with the ball. No opening changes before contact.
      const touchesBottom = moveY < 0 && fromY > bottom && by - ball.r <= bottom
        && bx + ball.r > sideAt(h, bottom, true) && bx - ball.r < sideAt(h, bottom, false);
      if (!state.inside && crossesTop) {
        const plane = h.y;
        const t = clamp((plane - fromY) / (by - fromY), 0, 1);
        const xAt = fromX + (bx - fromX) * t;
        if (xAt > sideAt(h, plane, true) && xAt < sideAt(h, plane, false)) {
          state.inside = true; state.exited = false;
          state.fromBelow = false;
        }
      }
      // Upward contact never captures or centers the ball in a virtual sleeve.
      if (touchesBottom) state.fromBelow = true;
      if (state.inside && (by - ball.r > bottom + 1 || by + ball.r < h.y - 1)) {
        state.inside = false; state.fromBelow = false; state.exited = true;
      }
      if (body.vy >= 0) state.fromBelow = false;
      if (by + ball.r < h.y - 1) state.fromBelow = false;
      if (state.inside) {
        // Finite sleeve reach supplies side tension. It cannot let a captured
        // ball escape sideways while the net is still wrapped around it.
        const progress = clamp((by - h.y) / Math.max(h.inner, bottom - h.y), 0, 1);
        let reach = h.inner * (.52 + progress * .85);
        const rimDy = by - h.y;
        if (Math.abs(rimDy) < ball.r) {
          // A sphere still overlapping the fixed upper opening must clear it;
          // otherwise edge projection stretches the first row into long spikes.
          const section = Math.sqrt(ball.r * ball.r - rimDy * rimDy);
          reach = Math.min(reach, Math.max(h.inner * .08, h.inner - section - h.inner * .04));
        }
        const x = clamp(bx, h.x - reach, h.x + reach);
        if (x !== bx) {
          bx = x; moveX = 0; body.vx = 0; corrected = true;
        }
      } else if (!state.fromBelow && by + ball.r > h.y - 2 && by - ball.r < hemScreen(h) + 2) {
        // Side walls run the full woven height. The rim mouth and the hem mouth
        // stay open; a ball whose center is already between the walls is not pushed.
        const pad = ball.r;
        const walls = screenWalls(h, by, ball.r);
        if (walls && fromX <= walls.left && bx + pad > walls.left) {
          bx = walls.left - pad; moveX = Math.min(moveX, 0);
          if (body.vx > 0) body.vx = -body.vx * .18;
          corrected = true;
        } else if (walls && fromX >= walls.right && bx - pad < walls.right) {
          bx = walls.right + pad; moveX = Math.max(moveX, 0);
          if (body.vx < 0) body.vx = -body.vx * .18;
          corrected = true;
        }
      }
      const knots = contact(h, body, fromX, fromY, bx, by, tick, profile);
      const ropes = contactEdges(h, bx, by, ball.r * 1.025, body.vy < 0);
      for (let pass = 0; pass < 6; pass++) {
        constrain(h, tick, 2, profile.rowPitch);
        if (knots || ropes) contactEdges(h, bx, by, ball.r * 1.025, body.vy < 0);
      }
      frictionTime += tick * Math.min(1, knots / 6 + ropes / 12);
    } else {
      constrain(h, tick, 12, profile.rowPitch);
    }
    constrainVelocity(h);
    pin(h);
    for (const n of h.net) {
      n.y += n.depth! * RIM_RY;
      n.py += n.prevDepth! * RIM_RY;
    }
  }
  if (corrected) {
    ball.x = pivotX + (bx - pivotX) * cos - (by - pivotY) * sin;
    ball.y = pivotY + (bx - pivotX) * sin + (by - pivotY) * cos;
  }
  if (frictionTime > 0 || corrected) {
    const drag = Math.exp(-2.8 * frictionTime);
    ball.vx = (body.vx * cos - body.vy * sin) * drag;
    ball.vy = (body.vx * sin + body.vy * cos) * drag;
    ball.omega *= Math.exp(-1.4 * frictionTime);
  }
}
