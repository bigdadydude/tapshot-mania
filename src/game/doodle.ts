/** Graffiti ball: pick up paint, draw a dashed rail the ball rides. */

export type DoodlePt = { x: number; y: number };

export type DoodlePickup = {
  x: number;
  y: number;
  r: number;
  /** Base amount at full life (fraction of bar). */
  amount: number;
  /** Seconds until this blob despawns. */
  life: number;
};

export type DoodleRun = {
  /** 0–1 paint reservoir (also the HUD bar fill). */
  paint: number;
  pickups: DoodlePickup[];
  spawnAcc: number;
  /** Committed rail the ball follows; shrinks as the ball rides it. */
  path: DoodlePt[];
  /** Finger is down (slow-mo). */
  drawing: boolean;
};

/** Near-frozen while finger is held (after hold arm). */
export const DOODLE_SLOWMO = 0.06;
/** Seconds the finger must stay down before slow-mo / draw arms. */
export const DOODLE_HOLD_ARM = 0.8;
export const DOODLE_SPAWN_EVERY = 2.1;
export const DOODLE_MAX_PICKUPS = 4;
/** Map paint blobs vanish after this many seconds. */
export const DOODLE_PICKUP_LIFE = 4;
/** Fixed base collect amount (scaled down by remaining life). */
export const DOODLE_PICKUP_AMOUNT = 0.1;
/** Stored paint drains 1% of a full bar every 3 seconds. */
export const DOODLE_PAINT_DECAY = 0.01 / 3;
/** Full bar buys this many world-widths of dashed path. */
export const DOODLE_PATH_WORLD_MULT = 2.5;
export const DOODLE_FOLLOW_SPEED = 720;
export const DOODLE_DRAG_START = 14;
/** Finger must start within this multiple of ball radius. */
export const DOODLE_START_FROM_BALL = 1.85;

export function emptyDoodle(): DoodleRun {
  return {
    paint: 0,
    pickups: [],
    spawnAcc: 0.6,
    path: [],
    drawing: false,
  };
}

export function doodlePathBudget(paint: number, worldW: number) {
  return Math.max(0, paint) * worldW * DOODLE_PATH_WORLD_MULT;
}

export function pathLength(pts: DoodlePt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return l;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function spawnDoodlePickup(
  run: DoodleRun,
  world: { w: number; floorY: number },
  ballR: number,
) {
  if (run.pickups.length >= DOODLE_MAX_PICKUPS) return;
  const m = Math.max(28, ballR * 1.6);
  run.pickups.push({
    x: m + Math.random() * Math.max(8, world.w - m * 2),
    y: world.floorY * (0.28 + Math.random() * 0.48),
    r: Math.max(14, ballR * 0.7),
    amount: DOODLE_PICKUP_AMOUNT,
    life: DOODLE_PICKUP_LIFE,
  });
}

/** Actual paint granted from a pickup (base × life remaining). */
export function doodlePickupYield(p: DoodlePickup) {
  const ttl = clamp(p.life / DOODLE_PICKUP_LIFE, 0, 1);
  return p.amount * ttl;
}

/** Tap a pickup → add paint scaled by remaining life. */
export function tryCollectDoodlePaint(
  run: DoodleRun,
  x: number,
  y: number,
): number {
  for (let i = 0; i < run.pickups.length; i++) {
    const p = run.pickups[i]!;
    if (Math.hypot(x - p.x, y - p.y) <= p.r * 1.35) {
      const got = doodlePickupYield(p);
      run.paint = clamp(run.paint + got, 0, 1);
      run.pickups.splice(i, 1);
      return got;
    }
  }
  return 0;
}

export function doodleStartsAtBall(
  finger: DoodlePt,
  ball: { x: number; y: number; r: number },
) {
  return Math.hypot(finger.x - ball.x, finger.y - ball.y) <= ball.r * DOODLE_START_FROM_BALL;
}

/**
 * Extend a live draw stroke. Spends paint for added length.
 * Returns the (possibly truncated) point list.
 */
export function extendDoodleDraw(
  run: DoodleRun,
  pts: DoodlePt[],
  next: DoodlePt,
  worldW: number,
): DoodlePt[] {
  if (pts.length === 0) return [{ ...next }];
  const last = pts[pts.length - 1]!;
  const add = Math.hypot(next.x - last.x, next.y - last.y);
  if (add < 2) return pts;
  const budget = doodlePathBudget(run.paint, worldW);
  if (budget < 2) return pts;
  if (add <= budget) {
    run.paint = clamp(run.paint - add / (worldW * DOODLE_PATH_WORLD_MULT), 0, 1);
    return [...pts, { ...next }];
  }
  const t = budget / add;
  const clipped = {
    x: last.x + (next.x - last.x) * t,
    y: last.y + (next.y - last.y) * t,
  };
  run.paint = 0;
  return [...pts, clipped];
}

/** Commit path starting at the ball — never snap the ball onto a distant stroke. */
export function commitDoodlePath(
  run: DoodleRun,
  pts: DoodlePt[],
  ball: { x: number; y: number },
) {
  run.drawing = false;
  if (pts.length < 2 || pathLength(pts) < 24) return;
  const start = { x: ball.x, y: ball.y };
  const out = pts.map((p) => ({ ...p }));
  out[0] = start;
  if (Math.hypot(out[1]!.x - start.x, out[1]!.y - start.y) < 2) {
    out.splice(1, 1);
  }
  if (out.length < 2) return;
  run.path = out;
}

/**
 * Ride the dashed rail in small steps (avoids tunneling the rim/board).
 * Path points behind the ball are dropped.
 */
export function followDoodlePath(
  run: DoodleRun,
  ball: { x: number; y: number; vx: number; vy: number; r: number },
  dt: number,
): boolean {
  if (run.path.length < 2) {
    run.path = [];
    return false;
  }
  // Keep the rail glued to the ball — no teleport onto the stroke.
  run.path[0] = { x: ball.x, y: ball.y };

  let remain = DOODLE_FOLLOW_SPEED * dt;
  const maxStep = Math.max(3, ball.r * 0.35);
  let lastDx = ball.vx;
  let lastDy = ball.vy;
  while (remain > 0.05 && run.path.length >= 2) {
    const a = run.path[0]!;
    const b = run.path[1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 0.8) {
      run.path.shift();
      continue;
    }
    lastDx = (b.x - a.x) / seg;
    lastDy = (b.y - a.y) / seg;
    const step = Math.min(remain, maxStep, seg);
    const t = step / seg;
    ball.x = a.x + (b.x - a.x) * t;
    ball.y = a.y + (b.y - a.y) * t;
    remain -= step;
    if (step >= seg - 0.05) {
      run.path.shift();
      run.path[0] = { x: ball.x, y: ball.y };
    } else {
      run.path[0] = { x: ball.x, y: ball.y };
    }
  }
  if (run.path.length < 2) run.path = [];
  const spd = DOODLE_FOLLOW_SPEED;
  ball.vx = lastDx * spd * 0.4;
  ball.vy = lastDy * spd * 0.4;
  return run.path.length >= 2;
}

export function stepDoodleSpawns(
  run: DoodleRun,
  dt: number,
  world: { w: number; floorY: number },
  ballR: number,
) {
  if (run.paint > 0) {
    run.paint = clamp(run.paint - DOODLE_PAINT_DECAY * dt, 0, 1);
  }
  for (const p of run.pickups) p.life -= dt;
  run.pickups = run.pickups.filter((p) => p.life > 0);

  if (run.drawing) return;
  run.spawnAcc += dt;
  if (run.spawnAcc < DOODLE_SPAWN_EVERY) return;
  run.spawnAcc = 0;
  spawnDoodlePickup(run, world, ballR);
}
