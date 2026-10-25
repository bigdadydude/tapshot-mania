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
  /** Closing speed in hoop radii/second: gentle contact to a fully loaded catch. */
  dynamicCatch?: { softSpeed: number; firmSpeed: number };
};

const RELEASED_ACCEL = 18;
const BALL_INV_MASS = 0.026;

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
  dynamicCatch: { softSpeed: 5, firmSpeed: 13 },
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
  /** Fraction of speed loss retained on a valid downward entry (1 = normal). */
  brakingScale?: number;
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
  const state = h.net[0]!.netState ??= {
    clock: 0, seed: (h.baseY ?? h.y) * 0.173 + h.inner * 3.71 + (h.side ?? 1) * 7.13,
    inside: false, exited: false, fromBelow: false, impactUntil: 0,
    entryVx: 0, entryVy: 0, entryOmega: 0, entryOffset: 0, impactApplied: false, throughMake: false,
  };
  state.entryVx ??= 0;
  state.entryVy ??= 0;
  state.entryOmega ??= 0;
  state.entryOffset ??= 0;
  state.impactApplied ??= false;
  state.throughMake ??= false;
  return state;
}

/** Stand recoil opposes the incoming hit; remote support hits lose leverage. */
export function netImpactStrength(h: Pick<Hoop, "x" | "y" | "inner">, x: number, y: number, impact: number, profile: NetProfile = NET2_PROFILE) {
  if (impact < h.inner * .6) return 0;
  const distance = Math.hypot(x - h.x, y - h.y);
  const attenuation = 1 / (1 + Math.pow(distance / (h.inner * 1.8), 2));
  return Math.min(h.inner * profile.hitCap, (impact - h.inner * .6) * profile.hitScale) * attenuation;
}

export function strikeNet2(h: Hoop, x: number, y: number, vx: number, vy: number, impact: number, profile: NetProfile = NET2_PROFILE) {
  const state = prepare(h), speed = Math.hypot(vx, vy);
  if (speed < 1 || impact < h.inner * .6 || state.clock < state.impactUntil) return 0;
  const strength = netImpactStrength(h, x, y, impact, profile);
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

/** Score feedback cannot authorize a catch. Only stepNet2's downward rim
 * crossing can start one, including when scoring runs before the cloth step. */
export function tugNet2(h: Hoop, ball?: Pick<Ball, "x" | "y" | "vx" | "vy" | "omega">, _profile: NetProfile = NET2_PROFILE) {
  if (!ball || ball.vy <= 0) return;
  const state = h.net[0]?.netState;
  if (!state?.inside || !state.throughMake || state.fromBelow) return;
  h.netPulse = 0.7;
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

type ContactLoad = {
  impulse: number; nx: number; ny: number; weight: number; closingSpeed: number; tautness: number;
  netVy: number;
};

function catchStrength(h: Hoop, load: ContactLoad, profile: NetProfile) {
  if (!profile.dynamicCatch) return 1;
  const { softSpeed, firmSpeed } = profile.dynamicCatch;
  // Opposite strands cancel sideways pressure, not the incoming vertical speed.
  // Normalize against their resultant so centered catches are not underestimated.
  const normalWeight = Math.max(Math.hypot(load.nx, load.ny), load.weight * .35, 1e-8);
  const speed = load.closingSpeed / normalWeight / h.inner;
  const u = clamp((speed - softSpeed) / (firmSpeed - softSpeed), 0, 1);
  return .08 + .97 * u * u * (3 - 2 * u) * (.85 + .15 * load.tautness);
}

/** Two-way sphere/strand contact. The ball is heavier than an individual knot.
 * Work in the hoop's local 3D frame; the ball itself stays in the court plane.
 * Rope tension is solved between contact passes, so the sleeve can move with an
 * oblique make instead of deleting its horizontal velocity at a fixed channel.
 */
function contactMake(h: Hoop, ball: Ball, dt: number, profile: NetProfile, impulses: boolean, lateral: ContactLoad, response = 1) {
  // Effective cloth mass includes the adjoining taut strands. This makes a
  // side hit resist and turn the ball instead of acting as a visual-only wrap.
  const ballInvMass = BALL_INV_MASS * response;
  const radius = ball.r * 1.025;
  const invInertia = ballInvMass / (2 / 3 * ball.r * ball.r);
  let contacts = 0;
  for (let e = 0; e < NET2_EDGES.length; e++) {
    const edge = NET2_EDGES[e]!;
    if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
    const a = h.net[edge.a]!, b = h.net[edge.b]!;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.depth! - a.depth!;
    const sq = dx * dx + dy * dy + dz * dz;
    const t = sq > 1e-8 ? clamp(((ball.x - a.x) * dx + (ball.y - a.y) * dy - a.depth! * dz) / sq, 0, 1) : 0;
    let nx = a.x + dx * t - ball.x, ny = a.y + dy * t - ball.y, nz = a.depth! + dz * t;
    const dist = Math.hypot(nx, ny, nz);
    if (dist >= radius || dist < 1e-6) continue;
    nx /= dist; ny /= dist; nz /= dist;
    const wa = a.pinned ? 0 : 1 - t, wb = b.pinned ? 0 : t;
    const clothMass = wa * wa + wb * wb;
    if (clothMass < 1e-6) continue;
    contacts++;
    const mass = clothMass + ballInvMass * (nx * nx + ny * ny);
    const push = (radius - dist) / mass;
    // A moving sphere carries the cloth it displaces. Keep part of that
    // velocity; removing it all here makes an oblique net spring upright.
    const clothVx = ((a.x - a.px) * (1 - t) + (b.x - b.px) * t) / dt;
    const clothVy = ((a.y - a.py) * (1 - t) + (b.y - b.py) * t) / dt;
    const clothVz = ((a.depth! - a.prevDepth!) * (1 - t) + (b.depth! - b.prevDepth!) * t) / dt;
    const closingSpeed = Math.max(0, (ball.vx - clothVx) * nx + (ball.vy - clothVy) * ny - clothVz * nz);
    const approaching = closingSpeed > 0;
    if (profile.dynamicCatch) {
      // Convert the XPBD multiplier to a force estimate using dt². Only tensile loads
      // count: compressed or slack cords must not make a slow touch feel rigid.
      const pull = Math.max(0, -tension[e]!) / (dt * dt);
      const tautness = pull / (pull + h.inner * 800);
      lateral.tautness = Math.max(lateral.tautness, tautness);
    }
    const preserve = approaching ? Math.exp(-100 * dt) : 1;
    a.x += nx * push * wa; a.px += nx * push * wa * (0.8 + 0.2 * preserve);
    a.y += ny * push * wa; a.py += ny * push * wa * preserve;
    a.depth! += nz * push * wa; a.prevDepth! += nz * push * wa * preserve;
    b.x += nx * push * wb; b.px += nx * push * wb * (0.8 + 0.2 * preserve);
    b.y += ny * push * wb; b.py += ny * push * wb * preserve;
    b.depth! += nz * push * wb; b.prevDepth! += nz * push * wb * preserve;
    ball.x -= nx * push * ballInvMass;
    ball.y -= ny * push * ballInvMass;
    const carry = push * (1 - preserve) / dt;
    lateral.impulse += nx * carry * (wa + wb) * 0.8;
    ball.vx -= nx * carry * ballInvMass;
    ball.vy -= ny * carry * ballInvMass;
    if (!impulses) continue;
    const vx = ((a.x - a.px) * (1 - t) + (b.x - b.px) * t) / dt;
    const vy = ((a.y - a.py) * (1 - t) + (b.y - b.py) * t) / dt;
    const vz = ((a.depth! - a.prevDepth!) * (1 - t) + (b.depth! - b.prevDepth!) * t) / dt;
    const rx = nx * ball.r, ry = ny * ball.r;
    // Positive omega is clockwise on the screen, matching ball.spin.
    const ux = ball.vx - ball.omega * ry - vx;
    const uy = ball.vy + ball.omega * rx - vy;
    const uz = -vz;
    const normal = ux * nx + uy * ny + uz * nz;
    const load = Math.max(0, normal) * (1 - Math.exp(-profile.contactResponse * 4 * dt)) / mass;
    lateral.nx += nx * load;
    lateral.ny += ny * load;
    lateral.weight += load;
    // Sample before projecting the ball/rope apart, so penetration correction
    // and repeated constraint passes cannot manufacture an impact speed.
    lateral.closingSpeed += closingSpeed * load;
    lateral.netVy += clothVy * load;
    const tx = ux - normal * nx, ty = uy - normal * ny, tz = uz - normal * nz;
    const tangentSpeed = Math.hypot(tx, ty, tz);
    const spinMass = invInertia * Math.pow(rx * ty - ry * tx, 2) / Math.max(1e-8, tangentSpeed * tangentSpeed);
    const friction = tangentSpeed > 1e-6
      ? Math.min(load * 0.7 / tangentSpeed, (1 - Math.exp(-40 * dt)) / (clothMass + ballInvMass + spinMass)) : 0;
    const jx = nx * load + tx * friction, jy = ny * load + ty * friction, jz = nz * load + tz * friction;
    a.px -= jx * wa * dt * 0.2; a.py -= jy * wa * dt; a.prevDepth! -= jz * wa * dt;
    b.px -= jx * wb * dt * 0.2; b.py -= jy * wb * dt; b.prevDepth! -= jz * wb * dt;
    lateral.impulse += jx * (wa + wb) * 0.8;
    ball.vx -= jx * ballInvMass; ball.vy -= jy * ballInvMass;
    ball.omega -= (rx * jy - ry * jx) * invInertia;
  }
  return contacts;
}

/** Transmit the resultant side load down the receiving half of the sleeve.
 * Centered pressure cancels. The normalized weights redistribute the contact
 * impulse rather than adding a separate impulse when scoring or leaving the net. */
function transmitSideLoad(h: Hoop, impulse: number, dt: number) {
  const sign = Math.sign(impulse);
  const weight = (i: number) => netRowReleased(h.char, REST[i]!.row) ? 0
    : Math.pow(REST[i]!.row / (NET_ROWS - 1), 2) * Math.max(0, sign * REST[i]!.x);
  let sum = 0;
  for (let i = NET_COLS; i < h.net.length; i++) sum += weight(i);
  if (sum < 1e-8) return;
  for (let i = NET_COLS; i < h.net.length; i++) {
    const n = h.net[i]!;
    const dx = n.x - h.x, dy = n.y - h.y;
    const length = Math.hypot(dx, dy) || 1;
    const tx = dy / length, ty = -dx / length;
    // Tension removes the radial component; the remaining momentum curls
    // the loaded side around the rim instead of stretching the cords.
    const kick = impulse * weight(i) / sum * dt * tx;
    n.px -= kick * tx;
    n.py -= kick * ty;
  }
}

function transmitCatchLoad(h: Hoop, ball: Ball, dx: number, dy: number, dt: number, profile: NetProfile) {
  // Part of the lost ball momentum moves the cloth; the rest is dissipated by
  // friction and the fixed rim. A harder catch must still visibly load the net.
  const transfer = profile.tugGain / BALL_INV_MASS;
  transmitSideLoad(h, dx * transfer, dt);
  const weight = (i: number) => netRowReleased(h.char, REST[i]!.row) ? 0
    : Math.exp(-Math.pow(Math.hypot(h.net[i]!.x - ball.x, h.net[i]!.y - ball.y, h.net[i]!.depth!) / (h.inner * .9), 2));
  let sum = 0;
  for (let i = NET_COLS; i < h.net.length; i++) sum += weight(i);
  if (sum < 1e-8) return;
  for (let i = NET_COLS; i < h.net.length; i++) h.net[i]!.py -= dy * transfer * weight(i) / sum * dt;
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

/** Closest point on a drawn strand. Knots are unprojected while the solver runs. */
function strandHit(h: Hoop, edge: { a: number; b: number }, px: number, py: number) {
  const a = h.net[edge.a]!, b = h.net[edge.b]!;
  const ax = a.x, ay = a.y + a.depth! * RIM_RY;
  const bx = b.x, by = b.y + b.depth! * RIM_RY;
  const abx = bx - ax, aby = by - ay;
  const sq = abx * abx + aby * aby;
  const t = sq > 1e-8 ? clamp(((px - ax) * abx + (py - ay) * aby) / sq, 0, 1) : 0;
  const cx = ax + abx * t, cy = ay + aby * t;
  return { t, cx, cy, dist: Math.hypot(px - cx, py - cy) };
}

/** Use the drawn, moving strands to recognize a ball lifting the net. A single
 * unprojected hem height misses off-center arrivals and a curling lower edge. */
function touchesUnderside(h: Hoop, radius: number, fromX: number, fromY: number, bx: number, by: number) {
  if (by >= fromY) return false;
  for (const edge of NET2_EDGES) {
    if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
    const now = strandHit(h, edge, bx, by);
    if (now.dist <= radius && by > now.cy) return true;
    const prev = strandHit(h, edge, fromX, fromY);
    if (prev.dist <= radius && fromY > prev.cy) return true;
  }
  return false;
}

/**
 * Soft contact with the strands the player can see.
 * A hit exists only when the ball circle meets a side strand. That strand
 * yields and takes part of the hit, and the ball stays on its outer side.
 * Strands in the rim mouth and the hem mouth do not shove the ball.
 */
function resistSleeve(h: Hoop, ball: Ball, body: { vx: number; vy: number },
  fromX: number, fromY: number, bx: number, by: number, tick: number) {
  const radius = ball.r;
  const mouth = h.inner * 0.22;
  let hits = 0;
  let sepX = 0, sepY = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (const edge of NET2_EDGES) {
      if (netRowReleased(h.char, REST[edge.a]!.row) || netRowReleased(h.char, REST[edge.b]!.row)) continue;
      const now = strandHit(h, edge, bx, by);
      const prev = strandHit(h, edge, fromX, fromY);
      const usePrev = prev.dist < now.dist;
      const cx = usePrev ? prev.cx : now.cx;
      const cy = usePrev ? prev.cy : now.cy;
      const t = usePrev ? prev.t : now.t;
      const depth = h.net[edge.a]!.depth! * (1 - t) + h.net[edge.b]!.depth! * t;
      // Front and back sheets sit off the court plane. The side wall is the
      // silhouette, where the strand's depth is near the ball.
      if (Math.abs(depth) > radius * 0.4) continue;
      if (Math.abs(cx - h.x) < mouth) continue;
      const beyond = (px: number) => Math.abs(px - h.x) > Math.abs(cx - h.x) + 0.75;
      const fromOut = beyond(fromX), nowOut = beyond(bx);
      if (!fromOut && !nowOut) continue;
      const crossed = fromOut && !nowOut && prev.dist < radius && Math.abs(by - cy) < radius;
      if (now.dist >= radius && !crossed) continue;
      let nx = bx - cx, ny = by - cy;
      let nlen = Math.hypot(nx, ny);
      if (nlen < 1e-4) { nx = Math.sign(cx - h.x) || 1; ny = 0; nlen = 1; }
      nx /= nlen; ny /= nlen;
      // Keep the push pointing out of the hoop. A center in the mouth is not outside.
      if (nx * (cx - h.x) + ny * (cy - h.y) < 0) continue;
      const a = h.net[edge.a]!, b = h.net[edge.b]!;
      const wa = a.pinned ? 0 : 1 - t, wb = b.pinned ? 0 : t;
      const sum = wa + wb;
      const pen = Math.max(radius - now.dist, crossed ? radius * 0.35 : 0);
      const cloth = sum > 1e-6 ? Math.min(pen * 0.55, 3.2) : 0;
      if (cloth > 0) {
        const shareA = wa / sum, shareB = wb / sum;
        const approach = Math.max(0, -(body.vx * nx + body.vy * ny));
        const kick = Math.min(approach * 0.4, h.inner * 8);
        const yieldX = -nx * cloth, yieldY = -ny * cloth;
        a.x += yieldX * shareA; a.y += yieldY * shareA;
        b.x += yieldX * shareB; b.y += yieldY * shareB;
        a.px += yieldX * shareA * 0.4 + nx * kick * tick * shareA;
        a.py += yieldY * shareA * 0.4 + ny * kick * tick * shareA;
        b.px += yieldX * shareB * 0.4 + nx * kick * tick * shareB;
        b.py += yieldY * shareB * 0.4 + ny * kick * tick * shareB;
      }
      const fix = Math.min(Math.max(pen - cloth, 0), radius * 0.55);
      if (fix > 0) {
        bx += nx * fix; by += ny * fix;
        sepX += nx * fix; sepY += ny * fix;
      }
      hits++;
    }
  }
  if (hits && (sepX !== 0 || sepY !== 0)) {
    const len = Math.hypot(sepX, sepY) || 1;
    const nx = sepX / len, ny = sepY / len;
    const into = body.vx * nx + body.vy * ny;
    // Shed speed into the cloth. A light touch only slows; a deep press stops.
    if (into < 0) {
      const absorb = clamp(-into / (h.inner * 18), 0.28, 0.82);
      body.vx -= nx * into * absorb;
      // Resolve along the strand normal in both axes. The surviving tangential
      // velocity slides along the net, changing the outgoing direction.
      body.vy -= ny * into * absorb;
    }
  }
  return { bx, by, hits };
}

export function stepNet2(h: Hoop, ball: Ball, prevX: number, prevY: number, _world: World,
  dt: number, _time: number, allowContact: boolean, env: Net2Environment = {}) {
  if (!(dt > 0) || !h.net.length) return;
  const profile = env.profile ?? NET2_PROFILE;
  const state = prepare(h);
  const canTouch = allowContact && !(h.burning && h.char > 0.45);
  if (!canTouch) {
    state.inside = false; state.fromBelow = false;
    state.throughMake = false;
    if (state.catchGrip !== undefined) state.catchGrip = 0;
    if (state.wrapTravel !== undefined) state.wrapTravel = state.wrapStrength = state.wrapNx = state.wrapNy = 0;
  }
  h.netPulse = Math.max(0, h.netPulse - dt);
  const total = Math.min(dt, 1 / 15);
  const motion = env.motion;
  const angle = motion?.angle ?? 0, cos = Math.cos(angle), sin = Math.sin(angle);
  const pivotX = motion?.pivotX ?? h.x, pivotY = motion?.pivotY ?? h.y;
  const toX = (x: number, y: number) => pivotX + (x - pivotX) * cos + (y - pivotY) * sin;
  const toY = (x: number, y: number) => pivotY - (x - pivotX) * sin + (y - pivotY) * cos;
  const body = { ...ball, x: toX(ball.x, ball.y), y: toY(ball.x, ball.y),
    vx: ball.vx * cos + ball.vy * sin, vy: -ball.vx * sin + ball.vy * cos };
  if (body.vy < 0) {
    state.inside = false; state.throughMake = false;
    if (state.catchGrip !== undefined) state.catchGrip = 0;
    if (state.wrapTravel !== undefined) state.wrapTravel = state.wrapStrength = state.wrapNx = state.wrapNy = 0;
  }
  let bx = toX(prevX, prevY), by = toY(prevX, prevY);
  const travel = Math.hypot(body.x - bx, body.y - by);
  const steps = Math.min(96, Math.max(1, Math.ceil(total * 240),
    canTouch ? Math.ceil(travel / Math.max(2, ball.r * 0.28)) : 1));
  const tick = total / steps;
  let moveX = (body.x - bx) / steps;
  let moveY = (body.y - by) / steps;
  let corrected = false, frictionTime = 0;
  for (let step = 0; step < steps; step++) {
    if (profile.dynamicCatch) state.catchGrip = (state.catchGrip ?? 0) * Math.exp(-tick / .14);
    const loaded = state.throughMake || h.netPulse > 0;
    const damping = Math.exp(-profile.dampRate * (loaded ? 0.3 : 1) * tick);
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
      const memory = released ? 0 : profile.shapeRestore * (loaded ? (profile.dynamicCatch ? 0.18 : 0.15) : 1);
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
      // Entry provenance is geometric, never inferred from a score or from
      // downward velocity while already below the rim. This is the sole gate
      // for the strong catch, redirection, speed response and sustained grip.
      const crossesTop = fromY < h.y && by >= h.y && body.vy > 0;
      if (crossesTop) {
        const plane = h.y;
        const t = clamp((plane - fromY) / (by - fromY), 0, 1);
        const xAt = fromX + (bx - fromX) * t;
        if (xAt > sideAt(h, plane, true) && xAt < sideAt(h, plane, false)) {
          state.inside = true; state.exited = false;
          state.fromBelow = false;
          state.entryVx = body.vx * cos - body.vy * sin;
          state.entryVy = body.vx * sin + body.vy * cos;
          state.entryOmega = body.omega;
          state.entryOffset = (xAt - h.x) / h.inner;
          state.impactApplied = false;
          if (state.catchGrip !== undefined) state.catchGrip = 0;
          if (profile.dynamicCatch) state.wrapTravel = state.wrapStrength = state.wrapNx = state.wrapNy = 0;
          state.throughMake = true;
          h.netPulse = 0.7;
        }
      }
      // Upward contact never captures or centers the ball in a virtual sleeve.
      if (!state.fromBelow && body.vy < 0 && touchesUnderside(h, ball.r, fromX, fromY, bx, by)) state.fromBelow = true;
      if (state.inside && (by - ball.r > bottom + 1 || by + ball.r < h.y - 1)) {
        state.inside = false; state.fromBelow = false; state.exited = true;
        state.throughMake = false;
        if (state.catchGrip !== undefined) state.catchGrip = 0;
        if (state.wrapTravel !== undefined) state.wrapTravel = state.wrapStrength = state.wrapNx = state.wrapNy = 0;
      }
      if (body.vy >= 0) state.fromBelow = false;
      if (by + ball.r < h.y - 1) state.fromBelow = false;
      // Made balls exchange momentum with the strands. Upward passages keep
      // the loose, one-way contact so an ascending ball is never captured.
      const mouth = state.inside || state.fromBelow;
      let knots = 0, ropes = 0;
      if (state.inside) {
        body.x = bx; body.y = by;
        const vx = body.vx, vy = body.vy;
        const inertia = 2 / 3 * body.r * body.r;
        const energy = vx * vx + vy * vy + inertia * body.omega * body.omega;
        const lateral: ContactLoad = { impulse: 0, nx: 0, ny: 0, weight: 0, closingSpeed: 0, tautness: 0, netVy: 0 };
        // The loose receiving strands first travel with the ball. Resistance
        // grows as contact takes up slack; merely crossing the rim cannot kick it.
        const wrapping = profile.dynamicCatch && !state.impactApplied;
        const wrapDistance = h.inner * .06;
        const response = wrapping ? .09 + .25 * clamp((state.wrapTravel ?? 0) / wrapDistance, 0, 1) : 1;
        knots = contactMake(h, body, tick, profile, true, lateral, response);
        for (let pass = 0; pass < 8; pass++) {
          constrain(h, tick, 2, profile.rowPitch);
          knots += contactMake(h, body, tick, profile, false, lateral, response);
        }
        transmitSideLoad(h, lateral.impulse, tick);
        let strength = catchStrength(h, lateral, profile);
        if (wrapping && lateral.weight > 1e-8) {
          state.wrapTravel = (state.wrapTravel ?? 0) + lateral.closingSpeed / lateral.weight * tick;
          state.wrapStrength = Math.max(state.wrapStrength ?? 0, strength);
          state.wrapNx = (state.wrapNx ?? 0) + lateral.nx * tick;
          state.wrapNy = (state.wrapNy ?? 0) + lateral.ny * tick;
          strength = state.wrapStrength;
        }
        const wrapped = !profile.dynamicCatch || ((state.wrapTravel ?? 0) >= wrapDistance && by > h.y + h.inner * .55);
        if (!state.impactApplied && wrapped && by > h.y && Math.hypot(lateral.nx, lateral.ny) > 1e-4) {
          // The loaded inner net turns the ball only after it has wrapped it.
          // The pressure-weighted normal chooses the direction; there is no
          // random kick or exit animation. Later contacts use sliding friction.
          let nx = profile.dynamicCatch ? state.wrapNx ?? lateral.nx : lateral.nx;
          let ny = profile.dynamicCatch ? state.wrapNy ?? lateral.ny : lateral.ny;
          if (Math.abs(state.entryOffset) < .05 && Math.abs(state.entryVx) < Math.abs(state.entryVy) * .05) nx = 0;
          const length = Math.hypot(nx, ny);
          if (length > 1e-4) {
            nx /= length; ny /= length;
            const into = body.vx * nx + body.vy * ny;
            if (into > 0) {
              const hitVx = body.vx, hitVy = body.vy;
              const keepNormal = profile.dynamicCatch ? 1 - strength * (.65 + .6 * Math.abs(nx)) : .35 - .6 * Math.abs(nx);
              const keepTangent = 1 - (profile.dynamicCatch ? .2 : .25) * strength;
              const tx = body.vx - into * nx, ty = body.vy - into * ny;
              body.vx = tx * keepTangent + into * keepNormal * nx;
              body.vy = ty * keepTangent + into * keepNormal * ny;
              transmitCatchLoad(h, body, hitVx - body.vx, hitVy - body.vy, tick, profile);
              state.impactApplied = true;
              if (profile.dynamicCatch) state.catchGrip = strength * strength;
            }
          }
        }
        if (profile.dynamicCatch && lateral.weight > 1e-8) {
          // A loaded net takes time to relax. Keep the resistance on real
          // approaching contacts while the cloth cups the ball, never in free air.
          // Hanging strands support the downward load. Side contact/friction
          // above still controls lateral motion; this support must not recenter it.
          const support = clamp(lateral.ny / lateral.weight * 3, 0, 1);
          const relative = body.vy - lateral.netVy / lateral.weight;
          const brake = Math.max(0, Math.min(body.vy, relative))
            * (1 - Math.exp(-45 * (state.catchGrip ?? 0) * support * tick));
          body.vy -= brake;
          transmitCatchLoad(h, body, 0, brake, tick, profile);
        }
        // Constraint stabilization is dissipative. It must not manufacture
        // kinetic energy when many overlapping ropes are projected at once.
        const after = body.vx * body.vx + body.vy * body.vy + inertia * body.omega * body.omega;
        if (after > energy && after > 0) {
          const scale = Math.sqrt(energy / after);
          body.vx *= scale; body.vy *= scale; body.omega *= scale;
        }
        // Heat reduces loss of speed, while preserving the contact's exit angle
        // and the cloth response. Never restore more than the incoming energy.
        const braking = clamp(env.brakingScale ?? 1, 0, 1);
        if (braking < 1) {
          const speed = Math.hypot(body.vx, body.vy);
          const limit = Math.min(Math.hypot(vx, vy), Math.sqrt(Math.max(0, energy - inertia * body.omega * body.omega)));
          if (speed > 1e-8 && limit > speed) {
            const scale = (speed + (limit - speed) * (1 - braking)) / speed;
            body.vx *= scale; body.vy *= scale;
          }
        }
        if (knots) {
          bx = body.x; by = body.y;
          moveX += (body.vx - vx) * tick;
          moveY += (body.vy - vy) * tick;
          corrected = true;
        }
      } else if (!mouth) {
        const vx = body.vx, vy = body.vy;
        const held = resistSleeve(h, ball, body, fromX, fromY, bx, by, tick);
        if (held.hits) {
          bx = held.bx; by = held.by;
          // Continue the remaining substeps with the resolved velocity. Zeroing
          // an entire axis here freezes tangential travel even after a grazing
          // ball clears the hem, leaving a visible gap like an invisible wall.
          moveX += (body.vx - vx) * tick;
          moveY += (body.vy - vy) * tick;
          corrected = true;
          frictionTime += tick;
        }
      } else {
        knots = contact(h, body, fromX, fromY, bx, by, tick, profile);
        ropes = contactEdges(h, bx, by, ball.r * 1.025, body.vy < 0);
      }
      for (let pass = 0; !state.inside && pass < 6; pass++) {
        constrain(h, tick, 2, profile.rowPitch);
        if (knots || ropes) contactEdges(h, bx, by, ball.r * 1.025, body.vy < 0);
      }
      if (!state.inside) frictionTime += tick * Math.min(1, knots / 6 + ropes / 12);
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
    ball.omega = body.omega * Math.exp(-1.4 * frictionTime);
  }
}
