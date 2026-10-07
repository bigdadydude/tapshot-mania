import type { Ball, World } from "./types";

export type VehicleKind = "sedan" | "suv" | "truck" | "taxi" | "van" | "bus" | "semi";
export type TrafficLane = "ground" | "bridge";
export type Vehicle = {
  id: number;
  kind: VehicleKind;
  lane: TrafficLane;
  dir: -1 | 1;
  x: number;
  prevX: number;
  speed: number;
  tint: number;
  /** Hoop-matched freeze timer; rendering uses this directly. */
  frozenLeft?: number;
  /** Ignite-stage fire; still solid until a blaze impact. */
  burning?: boolean;
  ignitedAt?: number;
  fireContact?: boolean;
  /** Seconds since a blaze ball torched it; such a car is debris, never solid. */
  burnt?: number;
  /** Render-only ballistic displacement from the lane: vx*t, vy*t + 450*t*t. */
  burnLaunch?: { vx: number; vy: number; spin?: number };
  /** Source center and fixed destination; rendering lerps and shrinks by elapsed. */
  absorbed?: { elapsed: number; x: number; y: number; targetX: number; targetY: number; entered?: boolean };
};
export type TrafficWarning = Omit<Vehicle, "x" | "prevX"> & { left: number };
export type TrafficState = {
  vehicles: Vehicle[];
  warnings: TrafficWarning[];
  next: Record<TrafficLane, number>;
  serial: number;
  clock: number;
  safeLeft: number;
  hitLock: number;
  launched: boolean;
  hits: number;
  respawns: number;
  nearMiss: number;
  encounters: Record<number, { close: boolean; awarded: boolean; blocked: boolean }>;
  contacts: Record<number, number>;
  frostGain: number;
  roofSpeed: number;
  burnScore: number;
  igniteUpgrade: boolean;
  lightningHit: boolean;
  hackerSlide?: { id: number; turn: number };
};

export type TrafficSkills = {
  tunneling?: boolean;
  hacker?: { x: number; y: number; speed: number };
  lightning?: boolean;
  discharge?: boolean;
  ignite?: boolean;
  blaze?: boolean;
  frost?: { chance: number; first: number; refresh: number };
  dt?: number;
  random?: () => number;
};

export const TRAFFIC_WARNING_SECONDS = 1.8;
export const TRAFFIC_SAFE_SECONDS = 5;
/** Char 0.25s, then shatter until removal. */
export const TRAFFIC_BURN_CHAR = 0.25;
export const TRAFFIC_BURN_SECONDS = 0.75;
export const TRAFFIC_BURN_SCORE = 5;
export const TRAFFIC_ABSORB_SECONDS = 0.8;
export const VEHICLE_KINDS: VehicleKind[] = ["sedan", "suv", "truck", "taxi", "van", "bus", "semi"];
const LANES: TrafficLane[] = ["ground", "bridge"];

/** Fixed bounded range; over three minutes the distribution shifts toward fast cars. */
export function trafficSpeed(width: number, seconds: number, roll: number) {
  const progress = Math.min(1, Math.max(0, seconds / 180));
  return width * (0.32 + 0.98 * Math.pow(Math.max(0, Math.min(1, roll)), 2.8 - progress * 2.25));
}

export function createTraffic(): TrafficState {
  return {
    vehicles: [], warnings: [], next: { ground: 0.6, bridge: 1.7 },
    serial: 0, clock: 0, safeLeft: 0, hitLock: 0, launched: false, hits: 0, respawns: 0,
    nearMiss: 0, encounters: {}, contacts: {}, frostGain: 0, roofSpeed: 0, burnScore: 0,
    igniteUpgrade: false, lightningHit: false,
  };
}

export function bridgeY(world: World) { return world.floorY * 0.51; }

export function vehicleSize(kind: VehicleKind, world: World) {
  const unit = world.w / 390;
  const dims = { sedan: [106, 39], suv: [119, 55], truck: [176, 88], taxi: [108, 42], van: [126, 62], bus: [184, 69], semi: [222, 88] }[kind];
  return { w: dims[0]! * unit, h: dims[1]! * unit };
}

export function vehicleBounds(v: Vehicle, world: World) {
  const { w, h } = vehicleSize(v.kind, world);
  const bottom = v.lane === "ground" ? world.floorY : bridgeY(world);
  return { x: v.x - w / 2, y: bottom - h, w, h, bottom };
}

/** Matching body + cabin boxes, expressed in a right-facing sprite's UVs. */
export function vehicleHulls(kind: VehicleKind) {
  if (kind === "semi") return [[0.02, 0.03, 0.67, 0.78], [0.74, 0.25, 0.24, 0.6], [0.08, 0.82, 0.85, 0.18]];
  if (kind === "bus" || kind === "van") return [[0.03, 0.04, 0.94, 0.79], [0.12, 0.8, 0.77, 0.2]];
  if (kind === "truck") return [[0.02, 0, 0.64, 0.85], [0.66, 0.28, 0.32, 0.57], [0.1, 0.82, 0.8, 0.18]];
  return [[0.02, 0.48, 0.96, 0.38], [0.22, 0.02, 0.55, 0.5], [0.13, 0.8, 0.72, 0.2]];
}

/** Capture every current car, including debris; call again after spawning while the hole is active. */
export function beginTrafficAbsorption(state: TrafficState, targetX: number, targetY: number) {
  for (const v of state.vehicles) {
    if (v.absorbed) continue;
    // Lane center Y is resolved by the renderer; y is a displacement from it.
    const t = v.burnt ?? 0;
    v.absorbed = {
      elapsed: 0, x: v.x + (v.burnLaunch?.vx ?? 0) * t,
      y: (v.burnLaunch?.vy ?? 0) * t + (v.burnLaunch ? 450 * t * t : 0),
      targetX, targetY,
    };
    state.encounters[v.id] = { close: false, awarded: true, blocked: true };
    if (state.hackerSlide?.id === v.id) state.hackerSlide = undefined;
  }
}

/** All clocks use the game's fixed simulation step, so pausing freezes warnings too. */
export function stepTraffic(state: TrafficState, world: World, dt: number, random = Math.random) {
  state.clock += dt;
  state.safeLeft = Math.max(0, state.safeLeft - dt);
  state.hitLock = Math.max(0, state.hitLock - dt);
  for (const v of state.vehicles) {
    v.prevX = v.x;
    if (v.absorbed) {
      const a = v.absorbed, half = vehicleSize(v.kind, world).w / 2;
      // Newly arriving cars enter at full size and are already non-solid.
      if (!a.entered && (a.x < half || a.x > world.w - half)) {
        const goal = Math.max(half, Math.min(world.w - half, a.x));
        const distance = Math.abs(goal - a.x);
        const travel = Math.min(distance, v.speed * dt);
        a.x += Math.sign(goal - a.x) * travel;
        if (travel >= distance) {
          a.entered = true;
          // Spend the remainder of this same step on suction, without an idle frame.
          a.elapsed += Math.max(0, dt - distance / Math.max(1, v.speed));
        }
      } else { a.entered = true; a.elapsed += dt; }
      continue;
    }
    if (v.burnt !== undefined) { v.burnt += dt; continue; }
    const frozenTime = Math.min(dt, v.frozenLeft ?? 0);
    v.x += v.dir * v.speed * (dt - frozenTime + frozenTime * 0.2);
    v.frozenLeft = Math.max(0, (v.frozenLeft ?? 0) - dt);
  }
  state.vehicles = state.vehicles.filter(v => {
    if (v.absorbed) return v.absorbed.elapsed < TRAFFIC_ABSORB_SECONDS;
    if (v.burnt !== undefined) return v.burnt < TRAFFIC_BURN_SECONDS;
    const half = vehicleSize(v.kind, world).w / 2;
    return v.dir > 0 ? v.x - half < world.w + 8 : v.x + half > -8;
  });
  for (let i = state.warnings.length - 1; i >= 0; i--) {
    const warning = state.warnings[i]!;
    warning.left -= dt;
    if (warning.left > 0) continue;
    const half = vehicleSize(warning.kind, world).w / 2;
    const x = warning.dir > 0 ? -half - 2 : world.w + half + 2;
    state.vehicles.push({ ...warning, x, prevX: x });
    state.warnings.splice(i, 1);
    state.next[warning.lane] = 1.1 + random() * 2;
  }
  for (const lane of LANES) {
    // One vehicle per level keeps opposing traffic readable and avoids overlapping cars.
    if (state.vehicles.some(v => v.lane === lane) || state.warnings.some(v => v.lane === lane)) continue;
    state.next[lane] -= dt;
    if (state.next[lane] > 0) continue;
    state.warnings.push({
      id: ++state.serial, lane, kind: VEHICLE_KINDS[Math.min(VEHICLE_KINDS.length - 1, Math.floor(random() * VEHICLE_KINDS.length))]!,
      dir: random() < 0.5 ? 1 : -1, speed: trafficSpeed(world.w, state.clock, random()),
      tint: Math.floor(random() * 3), left: TRAFFIC_WARNING_SECONDS,
    });
  }
}

/** Swept circle against a box: slab face intersections + exact rounded corners. */
function sweepCircle(x: number, y: number, dx: number, dy: number, r: number, w: number, h: number) {
  let best: { t: number; nx: number; ny: number; x: number; y: number } | null = null;
  const keep = (t: number, nx: number, ny: number, px: number, py: number) => {
    if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, nx, ny, x: px, y: py };
  };
  const cx = Math.max(0, Math.min(w, x)), cy = Math.max(0, Math.min(h, y));
  const distance = Math.hypot(x - cx, y - cy);
  if (distance < r) {
    if (distance > 0.0001) return { t: 0, nx: (x - cx) / distance, ny: (y - cy) / distance, x: cx + (x - cx) * r / distance, y: cy + (y - cy) * r / distance };
    const sides = [{ d: x, nx: -1, ny: 0, x: -r, y }, { d: w - x, nx: 1, ny: 0, x: w + r, y }, { d: y, nx: 0, ny: -1, x, y: -r }, { d: h - y, nx: 0, ny: 1, x, y: h + r }];
    sides.sort((a, b) => a.d - b.d);
    return { t: 0, ...sides[0]! };
  }
  if (dx !== 0) for (const [edge, nx] of [[-r, -1], [w + r, 1]]) {
    const t = (edge! - x) / dx, py = y + dy * t;
    if (dx * nx! < 0 && py >= 0 && py <= h) keep(t, nx!, 0, edge!, py);
  }
  if (dy !== 0) for (const [edge, ny] of [[-r, -1], [h + r, 1]]) {
    const t = (edge! - y) / dy, px = x + dx * t;
    if (dy * ny! < 0 && px >= 0 && px <= w) keep(t, 0, ny!, px, edge!);
  }
  const a = dx * dx + dy * dy;
  if (a > 0) for (const [qx, qy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const ox = x - qx!, oy = y - qy!, b = 2 * (ox * dx + oy * dy);
    const disc = b * b - 4 * a * (ox * ox + oy * oy - r * r);
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a), px = x + dx * t, py = y + dy * t;
    if ((qx === 0 ? px <= 0 : px >= w) && (qy === 0 ? py <= 0 : py >= h)) keep(t, (px - qx!) / r, (py - qy!) / r, px, py);
  }
  return best;
}

/** Distance from the circle surface to the actual sprite hull, not its empty bounding box. */
export function trafficClearance(v: Vehicle, world: World, ball: Ball) {
  const b = vehicleBounds(v, world);
  return Math.min(...vehicleHulls(v.kind).map(([u, top, width, height]) => {
    const x = b.x + (v.dir > 0 ? u! : 1 - u! - width!) * b.w;
    const y = b.y + top! * b.h;
    return Math.hypot(ball.x - Math.max(x, Math.min(x + width! * b.w, ball.x)), ball.y - Math.max(y, Math.min(y + height! * b.h, ball.y))) - ball.r;
  }));
}

/** Continue an edge cruise across frames until the requested direction points away. */
export function updateTrafficHackerSlide(state: TrafficState, world: World, ball: Ball, desired: { x: number; y: number; speed: number }) {
  const slide = state.hackerSlide;
  const v = slide && state.vehicles.find(v => v.id === slide.id && v.burnt === undefined && !v.absorbed);
  if (!slide || !v || state.safeLeft > 0) { state.hackerSlide = undefined; return; }
  const b = vehicleBounds(v, world);
  let closest: { distance: number; nx: number; ny: number } | undefined;
  for (const [u, top, width, height] of vehicleHulls(v.kind)) {
    const x = b.x + (v.dir > 0 ? u! : 1 - u! - width!) * b.w, y = b.y + top! * b.h;
    const dx = ball.x - Math.max(x, Math.min(x + width! * b.w, ball.x));
    const dy = ball.y - Math.max(y, Math.min(y + height! * b.h, ball.y));
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && (!closest || distance < closest.distance)) closest = { distance, nx: dx / distance, ny: dy / distance };
  }
  if (!closest || closest.distance > ball.r + 8 || desired.x * closest.nx + desired.y * closest.ny > 0.12) {
    state.hackerSlide = undefined;
    return;
  }
  ball.vx = -closest.ny * desired.speed * slide.turn;
  ball.vy = closest.nx * desired.speed * slide.turn;
}

/** Arm within one ball diameter; award once after safely leaving that range. Contact breaks the streak. */
export function stepTrafficNearMiss(state: TrafficState, world: World, ball: Ball, ignored = false) {
  const ids = new Set(state.vehicles.map(v => v.id));
  for (const id of Object.keys(state.encounters)) if (!ids.has(Number(id))) delete state.encounters[Number(id)];
  for (const id of Object.keys(state.contacts)) if (!ids.has(Number(id))) delete state.contacts[Number(id)];
  if (ignored || state.safeLeft > 0) {
    for (const v of state.vehicles) state.encounters[v.id] = { close: false, awarded: false, blocked: true };
    return;
  }
  for (const v of state.vehicles) {
    if (v.burnt !== undefined || v.absorbed) continue;
    const e = state.encounters[v.id] ??= { close: false, awarded: false, blocked: false };
    const gap = trafficClearance(v, world, ball);
    if (gap <= 0) {
      state.nearMiss = 0;
      for (const encounter of Object.values(state.encounters)) {
        encounter.close = false;
        encounter.blocked = true;
      }
      return;
    }
    if (!e.blocked && !e.awarded && gap <= ball.r * 2) e.close = true;
    if (!e.blocked && !e.awarded && e.close && gap > ball.r * 2) {
      e.close = false;
      e.awarded = true;
      state.nearMiss++;
    }
  }
}

/** Vehicles only affect the ball. Bridge art and hoops never enter this solver. */
export function collideTraffic(state: TrafficState, world: World, ball: Ball, prevX: number, prevY: number, skills: TrafficSkills = {}) {
  state.frostGain = 0;
  state.roofSpeed = 0;
  state.burnScore = 0;
  state.igniteUpgrade = false;
  state.lightningHit = false;
  if (state.safeLeft > 0 || skills.tunneling) return false;
  const responseLocked = state.hitLock > 0 && !skills.hacker && !skills.lightning;
  let first: { t: number; nx: number; ny: number; x: number; y: number; vehicle: Vehicle } | null = null;
  for (const v of state.vehicles) {
    if (v.burnt !== undefined || v.absorbed) continue;
    // Rearm only after a real gap, not a missed solver frame or cooldown.
    if (v.fireContact && trafficClearance(v, world, ball) > 3 * world.w / 390) v.fireContact = false;
    const bounds = vehicleBounds(v, world);
    for (const hull of vehicleHulls(v.kind)) {
      const [u, top, width, height] = hull as [number, number, number, number];
      const x = bounds.x + (v.dir > 0 ? u : 1 - u - width) * bounds.w;
      const y = bounds.y + top * bounds.h;
      const carDX = v.x - v.prevX;
      const hit = sweepCircle(prevX - (x - carDX), prevY - y, ball.x - prevX - carDX, ball.y - prevY, ball.r + (skills.lightning || skills.hacker ? 0.8 : 0), width * bounds.w, height * bounds.h);
      if (hit && (!first || hit.t < first.t)) first = { ...hit, x: x + hit.x, y: y + hit.y, vehicle: v };
    }
  }
  if (!first) return false;
  const { nx, ny, vehicle: v } = first;
  state.nearMiss = 0;
  for (const e of Object.values(state.encounters)) { e.close = false; e.blocked = true; }
  if (skills.blaze) {
    // Torching keeps the ball's path and +5 reward, but still interrupts a pass streak.
    v.burnt = 0;
    v.burning = false;
    const speed = Math.hypot(ball.vx, ball.vy);
    const dx = speed > 20 ? ball.vx / speed : -nx;
    const dy = speed > 20 ? ball.vy / speed : -ny;
    const impulse = Math.max(world.w * 0.65, Math.min(world.w * 1.3, speed * 0.85));
    const bounds = vehicleBounds(v, world);
    const leverX = (first.x - v.x) / bounds.w;
    const leverY = (first.y - bounds.y - bounds.h / 2) / bounds.h;
    v.burnLaunch = {
      vx: dx * impulse,
      vy: dy * impulse * 0.65 - world.h * 0.38,
      spin: Math.max(-5, Math.min(5, (leverX * dy - leverY * dx) * 6)),
    };
    v.frozenLeft = 0;
    state.encounters[v.id] = { close: false, awarded: true, blocked: true };
    state.burnScore = TRAFFIC_BURN_SCORE;
    return false;
  }
  state.encounters[v.id] = { close: false, awarded: false, blocked: true };
  // A fresh contact must be separated by 0.3s. Sustained roof friction cannot farm frost.
  const fresh = state.clock - (state.contacts[v.id] ?? -Infinity) >= 0.3;
  state.contacts[v.id] = state.clock;
  if (skills.ignite && !v.fireContact) {
    state.igniteUpgrade = v.burning === true;
    if (!v.burning) v.ignitedAt = state.clock;
    v.burning = true;
  }
  v.fireContact = true;
  // Require both a fresh encounter and the collision cooldown. Roof friction
  // still resolves every frame, but cannot repeatedly spend charge for score.
  if (skills.discharge && fresh && state.hitLock <= 0) {
    state.lightningHit = true;
    state.hitLock = 0.18;
  }
  if (fresh && skills.frost) {
    const frozen = (v.frozenLeft ?? 0) > 0;
    if (frozen) state.frostGain = 1;
    if ((skills.random ?? Math.random)() < skills.frost.chance) v.frozenLeft = frozen ? skills.frost.refresh : skills.frost.first;
  }
  if (responseLocked) return false;
  const vehicleVX = v.dir * v.speed * ((v.frozenLeft ?? 0) > 0 ? 0.2 : 1);
  const normalSpeed = (ball.vx - vehicleVX) * nx + ball.vy * ny;
  // Skill contacts use a small detection skin but resolve to the true surface,
  // retaining contact on the next step instead of flickering out of roof friction.
  const offset = skills.hacker || skills.lightning ? -0.3 : 0.5;
  ball.x = first.x + nx * offset;
  ball.y = first.y + ny * offset;
  if (skills.hacker) {
    const tangentX = -ny, tangentY = nx;
    const dot = skills.hacker.x * tangentX + skills.hacker.y * tangentY;
    const turn = state.hackerSlide?.id === v.id ? state.hackerSlide.turn : Math.abs(dot) > 0.001 ? Math.sign(dot) : ny <= 0 ? 1 : -1;
    state.hackerSlide = { id: v.id, turn };
    // The swept hit supplies the normal, but don't discard this frame's tangent
    // travel: repeatedly snapping to t=0 otherwise pins hackers to the first edge.
    const travelX = ball.vx * (skills.dt ?? 1 / 60), travelY = ball.vy * (skills.dt ?? 1 / 60);
    const tangentTravel = travelX * tangentX + travelY * tangentY;
    ball.x += tangentX * tangentTravel;
    ball.y += tangentY * tangentTravel;
    // Adjacent cab/body hulls form one car; tangent travel must not enter a
    // neighboring hull at the silhouette's stepped corners.
    const bounds = vehicleBounds(v, world);
    for (let pass = 0; pass < 4; pass++) for (const [u, top, width, height] of vehicleHulls(v.kind)) {
      const x = bounds.x + (v.dir > 0 ? u! : 1 - u! - width!) * bounds.w;
      const y = bounds.y + top! * bounds.h;
      const overlap = sweepCircle(ball.x - x, ball.y - y, 0, 0, ball.r + 0.4, width! * bounds.w, height! * bounds.h);
      if (overlap) { ball.x = x + overlap.x; ball.y = y + overlap.y; }
    }
    ball.vx = tangentX * skills.hacker.speed * turn;
    ball.vy = tangentY * skills.hacker.speed * turn;
    ball.omega = ball.vx / Math.max(8, ball.r);
    state.launched = false;
    return true;
  }
  if (skills.lightning && ny < -0.7) {
    state.launched = false;
    const relative = ball.vx - vehicleVX;
    state.roofSpeed = Math.abs(relative);
    ball.vx -= relative * Math.min(1, 2.8 * (skills.dt ?? 1 / 60));
    ball.vy = 0;
    ball.omega = (ball.vx - vehicleVX) / Math.max(8, ball.r);
    return true;
  }
  if (normalSpeed < 0) {
    ball.vx -= 1.6 * normalSpeed * nx;
    ball.vy -= 1.6 * normalSpeed * ny;
  }
  // Side hits throw upward as well as forward, so the collision is unmistakable.
  const frontHit = Math.abs(nx) > 0.35 && Math.sign(nx) === v.dir && normalSpeed < 0;
  if (Math.abs(nx) > 0.35) {
    ball.vx = v.dir * Math.max(Math.abs(ball.vx), Math.abs(vehicleVX) * 1.65);
    ball.vy = Math.min(ball.vy, -world.h * (v.kind === "truck" ? 0.63 : 0.46));
  } else if (ny < 0) {
    ball.vx += vehicleVX * 0.55;
    ball.vy = Math.min(ball.vy, -world.h * 0.38);
  }
  ball.omega = v.dir * 18;
  // Only a bumper launch arms immunity; roof or tail contacts just bounce.
  state.launched = frontHit;
  state.hitLock = 0.18;
  state.hits++;
  return true;
}

export function trafficOutOfBounds(state: TrafficState, world: World, ball: Ball) {
  return state.launched && (ball.x + ball.r < 0 || ball.x - ball.r > world.w || ball.y + ball.r < 0 || ball.y - ball.r > world.h);
}

/** The ball keeps flying and wraps as usual; only immunity starts here. */
export function grantTrafficSafe(state: TrafficState, ball: Ball) {
  ball.trafficSafe = true;
  state.safeLeft = TRAFFIC_SAFE_SECONDS;
  state.launched = false;
  state.hitLock = 0;
  state.respawns++;
}
