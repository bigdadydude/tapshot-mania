/** Prison yard: recess ↔ lockdown with searchlights + border lasers. */

import type { Ball, Hoop, World } from "../types";
import type { ModifierHost, StageModifier, YardLightsHud } from "../modifiers";
import {
  coneGeometry,
  drawSearchlightBeam,
  lightForSide,
  loadSearchlightLayout,
  majorLocalAngle,
  placementEmit,
  placementPivot,
  spriteSize,
  wallQuad,
  worldBeamAngle,
  type SearchlightLayout,
  type SearchlightPlacement,
} from "../searchlight-layout";

function angleDelta(a: number, b: number) {
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function closerAngle(preferred: number, a: number, b: number) {
  return Math.abs(angleDelta(preferred, a)) <= Math.abs(angleDelta(preferred, b)) ? a : b;
}

type Phase = "recess" | "lockdown";

type Spot = {
  side: -1 | 1;
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  cone: number;
  retarget: number;
  lock: number;
  cool: number;
};

/** Red aim line that tracks the ball, then locks and fires a bolt. */
type Trace = {
  ox: number;
  oy: number;
  aimX: number;
  aimY: number;
  trackLeft: number;
  holdLeft: number;
  locked: boolean;
  elite: boolean;
};

type Bolt = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  elite: boolean;
  r: number;
  /** Boundary reflections so far (elite only). */
  bounces: number;
};

type LightFx = {
  /** Seconds remaining stopped / darkened. */
  out: number;
  /** Hit flash timer. */
  shake: number;
  /** After out ends: beam flickers twice before hunting again. */
  wake: number;
};

const RECESS = 15;
const LOCKDOWN = 10;
/** Continuous illumination needed before both lamps hard-lock. */
const LIT_LOCK = 0.8;
/** Time off the beam before lamps resume slow sweep. */
const ESCAPE_TIME = 1.2;
const COOL = 1.7;
const CONE = 0.22;
/** Idle yard sweep — slow pan across the court. */
const SWEEP = 0.55;
/** Follow rate while tracking the ball's motion. */
const TRACK = 3.2;
/** Snap rate once both lamps hard-lock. */
const LOCK_CHASE = 8;
const BOLT_SPD = 1100;
const ELITE_SPD = 920;
const KNOCK = 1180;
/** Base stop time when a lamp is shot; stacks on repeat hits while down. */
const LIGHT_OUT = 2;
/** Post-stop beam flicker (two pulses) before resume. */
const WAKE = 0.55;
/** Elite bolt vanishes on the 11th border contact (after 10 bounces). */
const ELITE_MAX_BOUNCE = 10;
const TRACE_HOLD = 0.18;
const BORDER = 28;
const TRACE_LINE = 1.8;

type HuntMode = "sweep" | "track" | "lock";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

let spriteImg: HTMLImageElement | null = null;
let spriteSrc = "";

const bulletImgs: Record<string, HTMLImageElement | null> = {};
const BULLET_NORMAL = "/game/modifiers/bullet-normal.png";
const BULLET_ELITE = "/game/modifiers/bullet-elite.png";

function ensureSprite(src: string) {
  if (spriteSrc === src && spriteImg) return spriteImg;
  spriteSrc = src;
  spriteImg = null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    spriteImg = img;
  };
  img.src = src;
  return spriteImg;
}

function ensureBullet(src: string) {
  const cached = bulletImgs[src];
  if (cached && cached.complete && cached.naturalWidth > 0) return cached;
  if (cached) return cached.complete ? cached : null;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  bulletImgs[src] = img;
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function drawBoltSprite(ctx: CanvasRenderingContext2D, b: Bolt) {
  const img = ensureBullet(b.elite ? BULLET_ELITE : BULLET_NORMAL);
  const ang = Math.atan2(b.vy, b.vx);
  // 128×32 art → keep 4:1; tip sits on the hit point.
  const dw = b.elite ? 52 : 40;
  const dh = dw * (32 / 128);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -dw, -dh * 0.5, dw, dh);
  } else {
    ctx.strokeStyle = b.elite ? "rgba(255,140,50,0.98)" : "rgba(255,70,60,0.95)";
    ctx.lineWidth = b.r * (b.elite ? 1.7 : 1.35);
    ctx.lineCap = "round";
    const tail = b.elite ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(-b.r * tail, 0);
    ctx.lineTo(b.r * 1.2, 0);
    ctx.stroke();
    ctx.fillStyle = b.elite ? "#ffe0a8" : "#fff5e6";
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function liveBodyAngle(
  world: World,
  light: SearchlightPlacement,
  aimX: number,
  aimY: number,
) {
  const piv = placementPivot(world, light);
  const side: -1 | 1 = light.side === "left" ? -1 : 1;
  const clamped = clampAimHemisphere(side, piv.x, piv.y, aimX, aimY);
  const q = wallQuad(world);
  const want = Math.atan2(clamped.y - piv.y, clamped.x - piv.x);
  const ml = majorLocalAngle(light);
  // Two bodies whose major-perp can emit along `want` (differ by π).
  const bodyA = want - (ml + Math.PI * 0.5);
  const bodyB = want - (ml - Math.PI * 0.5);

  // Authored rest pose locks which way the housing "faces" relative to the beam.
  const restBeam = worldBeamAngle(light, light.angle, world, q);
  const localBeam = angleDelta(restBeam, light.angle);

  const score = (body: number) => {
    const emit = placementEmit(world, light, body, q);
    const beam = worldBeamAngle(light, body, world, q, clamped);
    const toAim = Math.atan2(clamped.y - emit.y, clamped.x - emit.x);
    const spriteFwd = body + localBeam;
    // Beam must hit the aim AND agree with the housing forward (not π-flipped).
    return Math.abs(angleDelta(beam, toAim)) * 3 + Math.abs(angleDelta(beam, spriteFwd)) * 2;
  };

  const sA = score(bodyA);
  const sB = score(bodyB);
  if (Math.abs(sA - sB) < 0.05) return closerAngle(light.angle, bodyA, bodyB);
  return sA <= sB ? bodyA : bodyB;
}

/**
 * Left lamp: right half-plane (diameter vertical). Right lamp: left half-plane.
 * Straight edge ⊥ ground → aim stays on the court-facing semicircle.
 */
function clampAimHemisphere(
  side: -1 | 1,
  pivX: number,
  pivY: number,
  ax: number,
  ay: number,
) {
  const dx = ax - pivX;
  const dy = ay - pivY;
  const dist = Math.max(Math.hypot(dx, dy), 1);
  // Already inside the allowed half-plane.
  if (side < 0 && dx >= 0) return { x: ax, y: ay };
  if (side > 0 && dx <= 0) return { x: ax, y: ay };
  // Past the vertical diameter → project onto the nearer vertical ray.
  const sy = dy >= 0 ? 1 : -1;
  return { x: pivX, y: pivY + sy * dist };
}

function clampSpotAim(
  world: World,
  light: SearchlightPlacement | null | undefined,
  side: -1 | 1,
  ax: number,
  ay: number,
) {
  if (!light) return { x: ax, y: ay };
  const piv = placementPivot(world, light);
  return clampAimHemisphere(side, piv.x, piv.y, ax, ay);
}

function homeAim(world: World, light: SearchlightPlacement) {
  const piv = placementPivot(world, light);
  const beam = worldBeamAngle(light, light.angle, world, wallQuad(world));
  const reach = Math.hypot(world.w, world.floorY) * 0.42;
  return clampAimHemisphere(
    light.side === "left" ? -1 : 1,
    piv.x,
    piv.y,
    piv.x + Math.cos(beam) * reach,
    piv.y + Math.sin(beam) * reach,
  );
}

function lightHunting(fx: LightFx) {
  return fx.out <= 0 && fx.wake <= 0;
}

/** Wake pulse: two flashes over WAKE seconds. */
function wakePulse(fx: LightFx) {
  if (fx.out > 0) return 0;
  if (fx.wake <= 0) return 1;
  const t = 1 - fx.wake / WAKE;
  return Math.abs(Math.sin(t * Math.PI * 2));
}

function drawSearchlightSprite(
  ctx: CanvasRenderingContext2D,
  world: World,
  layout: SearchlightLayout,
  light: SearchlightPlacement,
  bodyAngle: number,
  fx: LightFx,
  time: number,
) {
  const quad = wallQuad(world);
  const piv = placementPivot(world, light, quad);
  const { dw, dh } = spriteSize(light, world.w);
  const img = ensureSprite(layout.spriteSrc);
  const shake =
    fx.shake > 0
      ? Math.sin(time * 55) * (3.5 + fx.shake * 6) * (Math.random() > 0.5 ? 1 : -1)
      : 0;
  const flicker =
    fx.shake > 0 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 40)) : fx.out > 0 ? 0.82 : 1;
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.translate(piv.x + shake, piv.y + shake * 0.4);
  ctx.rotate(bodyAngle);
  if (light.flipX) ctx.scale(-1, 1);
  ctx.translate(-light.pivotU * dw, -light.pivotV * dh);
  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(img, 0, 0, dw, dh);
  } else {
    const rr = world.w * 0.012;
    ctx.fillStyle = "#d4b45a";
    ctx.beginPath();
    ctx.ellipse(light.pivotU * dw, light.pivotV * dh, rr * 1.6, rr, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function pickTarget(
  world: World,
  ball: { x: number; y: number },
  biasBall: boolean,
  side?: -1 | 1,
  light?: SearchlightPlacement | null,
): { x: number; y: number } {
  const margin = world.ballR * 2;
  let x: number;
  let y: number;
  if (biasBall && Math.random() < 0.45) {
    x = clamp(ball.x + (Math.random() - 0.5) * world.ballR * 6, margin, world.w - margin);
    y = clamp(ball.y + (Math.random() - 0.5) * world.ballR * 5, world.floorY * 0.42, world.floorY - margin);
  } else {
    x = margin + Math.random() * (world.w - margin * 2);
    y = world.floorY * (0.45 + Math.random() * 0.42);
  }
  if (side !== undefined && light) {
    const piv = placementPivot(world, light);
    return clampAimHemisphere(side, piv.x, piv.y, x, y);
  }
  return { x, y };
}

function inCone(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  half: number,
  maxLen: number,
) {
  const dx = bx - px;
  const dy = by - py;
  const len = Math.hypot(dx, dy) || 1;
  if (len > maxLen) return false;
  const tx = ax - px;
  const ty = ay - py;
  const tlen = Math.hypot(tx, ty) || 1;
  const dot = (dx * tx + dy * ty) / (len * tlen);
  return dot >= Math.cos(half);
}

function segmentHitsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) return fx * fx + fy * fy <= r * r;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

/** Lead point along the ball's motion (运动方向追踪). */
function ballLead(ball: Ball, lead = 0.28) {
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd < 40) return { x: ball.x, y: ball.y };
  return {
    x: ball.x + ball.vx * lead,
    y: ball.y + ball.vy * lead,
  };
}

/** Origin outside a random border, aimed roughly at the lead point. */
function borderOrigin(world: World, aimX: number, aimY: number) {
  const pad = BORDER + 8;
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) {
    return { x: -pad, y: clamp(aimY + (Math.random() - 0.5) * 80, 0, world.floorY) };
  }
  if (edge === 1) {
    return { x: world.w + pad, y: clamp(aimY + (Math.random() - 0.5) * 80, 0, world.floorY) };
  }
  if (edge === 2) {
    return { x: clamp(aimX + (Math.random() - 0.5) * 80, 0, world.w), y: -pad };
  }
  return {
    x: clamp(aimX + (Math.random() - 0.5) * 80, 0, world.w),
    y: world.floorY + pad,
  };
}

function outsidePlay(world: World, x: number, y: number) {
  return x < -BORDER || x > world.w + BORDER || y < -BORDER || y > world.floorY + BORDER;
}

/** Ball wrapped / left the playable strip — lamps lose the target. */
function ballLostAtBorder(world: World, ball: Ball) {
  return ball.x < -ball.r - 2 || ball.x > world.w + ball.r + 2;
}

/**
 * Reflect elite bolt off play rect. Returns true when it should vanish
 * (11th border hit after 10 bounces).
 */
function bounceElite(world: World, b: Bolt, x0: number, y0: number): boolean {
  let { x, y, vx, vy } = b;
  const minX = 0;
  const maxX = world.w;
  const minY = 0;
  const maxY = world.floorY;
  let bounced = false;
  for (let i = 0; i < 4; i++) {
    let hit = false;
    if (x < minX && vx < 0) {
      x = minX + (minX - x);
      vx = -vx;
      hit = true;
    } else if (x > maxX && vx > 0) {
      x = maxX - (x - maxX);
      vx = -vx;
      hit = true;
    }
    if (y < minY && vy < 0) {
      y = minY + (minY - y);
      vy = -vy;
      hit = true;
    } else if (y > maxY && vy > 0) {
      y = maxY - (y - maxY);
      vy = -vy;
      hit = true;
    }
    if (!hit) break;
    bounced = true;
  }
  if (x < minX || x > maxX || y < minY || y > maxY) {
    x = clamp(x0, minX, maxX);
    y = clamp(y0, minY, maxY);
  }
  if (bounced) {
    b.bounces += 1;
    if (b.bounces > ELITE_MAX_BOUNCE) {
      b.x = -9999;
      return true;
    }
  }
  b.x = x;
  b.y = y;
  b.vx = vx;
  b.vy = vy;
  return false;
}

function hoopHitRadius(h: Hoop) {
  return Math.max(h.inner * 1.15, 28);
}

function lightHitRadius(world: World, light: SearchlightPlacement) {
  const { dw } = spriteSize(light, world.w);
  return Math.max(18, dw * 0.28);
}

function multiTraceChance(makes: number) {
  return clamp(0.2 + makes * 0.05, 0.2, 0.88);
}

function eliteChance(makes: number) {
  return clamp(0.12 + makes * 0.035, 0.12, 0.55);
}

/** Lockdown #1 → [1,2], #2 → [1,3], … Makes bias toward the high end. */
function rollVolleyCount(lockdownN: number, makes: number) {
  const max = Math.max(2, lockdownN + 1);
  let n = 1;
  for (let k = 2; k <= max; k++) {
    const p = clamp(
      multiTraceChance(makes) - (k - 2) * 0.08 + (lockdownN - 1) * 0.03,
      0.1,
      0.92,
    );
    if (Math.random() < p) n = k;
    else break;
  }
  return n;
}

export function createYardLights(): StageModifier {
  let phase: Phase = "recess";
  let recessLeft = RECESS;
  let lockdownLeft = LOCKDOWN;
  let spots: Spot[] = [];
  let traces: Trace[] = [];
  let bolts: Bolt[] = [];
  let dim = 0;
  let warned = false;
  let live = false;
  let lightFx: Record<"left" | "right", LightFx> = {
    left: { out: 0, shake: 0, wake: 0 },
    right: { out: 0, shake: 0, wake: 0 },
  };
  let timeAcc = 0;
  /** sweep → track (following ball) → lock (both hard-lock + fire). */
  let hunt: HuntMode = "sweep";
  /** Continuous time the ball has been inside a living cone. */
  let litAcc = 0;
  /** Continuous time the ball has been outside all living cones. */
  let escapeAcc = 0;
  let fireCool = 0;
  /** 1-based lockdown ordinal this run (drives volley size). */
  let lockdownIndex = 0;
  /** Center HUD status while locked down. */
  let statusMode: "patrol" | "infraction" | "lost" = "patrol";
  let lostLeft = 0;
  /** After 全监封锁, flash 巡逻中 once lamps sweep. */
  let patrolTagLeft = 0;
  /** Announce 放风时间 on first playing tick (title begin stays silent). */
  let recessStartPending = false;

  function resetSpots(world: World) {
    const layout = loadSearchlightLayout();
    spots = ([-1, 1] as const).map((side) => {
      const light = lightForSide(layout, side);
      const t = light
        ? homeAim(world, light)
        : pickTarget(world, { x: world.w * 0.5, y: world.floorY * 0.7 }, false);
      return {
        side,
        ax: t.x,
        ay: t.y,
        tx: t.x,
        ty: t.y,
        cone: light?.cone ?? CONE,
        retarget: 1.2 + Math.random() * 1.6,
        lock: 0,
        cool: 0,
      };
    });
    hunt = "sweep";
    litAcc = 0;
    escapeAcc = 0;
    fireCool = 0;
  }

  function snapSpotHome(side: "left" | "right", world: World) {
    const layout = loadSearchlightLayout();
    const light = lightForSide(layout, side === "left" ? -1 : 1);
    const spot = spots.find((s) => (s.side < 0 ? "left" : "right") === side);
    if (!spot || !light) return;
    const home = homeAim(world, light);
    spot.ax = home.x;
    spot.ay = home.y;
    spot.tx = home.x;
    spot.ty = home.y;
    spot.lock = 0;
    spot.retarget = 1.4 + Math.random() * 1.2;
  }

  function loseHuntTarget(host: ModifierHost, markLost = false) {
    if (hunt === "sweep") {
      if (markLost && phase === "lockdown") {
        statusMode = "lost";
        lostLeft = 1.55;
        host.tag("丢失目标");
      }
      return;
    }
    hunt = "sweep";
    litAcc = 0;
    escapeAcc = 0;
    for (const s of spots) s.lock = 0;
    if (phase === "lockdown") {
      statusMode = "lost";
      lostLeft = 1.55;
      host.tag("丢失目标");
    }
  }

  function clearTraces() {
    traces = [];
  }

  function enterRecess(host: ModifierHost, announce: boolean) {
    phase = "recess";
    recessLeft = RECESS;
    lockdownLeft = LOCKDOWN;
    warned = false;
    // Keep in-flight bolts when searchlights go dark.
    clearTraces();
    hunt = "sweep";
    litAcc = 0;
    escapeAcc = 0;
    statusMode = "patrol";
    lostLeft = 0;
    patrolTagLeft = 0;
    resetSpots(host.world);
    if (announce) {
      recessStartPending = false;
      host.tag("放风时间");
    }
  }

  function enterLockdown(host: ModifierHost) {
    phase = "lockdown";
    lockdownLeft = LOCKDOWN;
    recessLeft = 0;
    warned = false;
    clearTraces();
    hunt = "sweep";
    litAcc = 0;
    escapeAcc = 0;
    lockdownIndex += 1;
    statusMode = "patrol";
    lostLeft = 0;
    resetSpots(host.world);
    host.tag("全监封锁");
    // After the lockdown banner, show patrol once lamps start sweeping.
    patrolTagLeft = 0.85;
  }

  function startTrace(host: ModifierHost, elite: boolean) {
    const ball = host.getBallBody();
    const lead = ballLead(ball);
    const origin = borderOrigin(host.world, lead.x, lead.y);
    traces.push({
      ox: origin.x,
      oy: origin.y,
      aimX: lead.x,
      aimY: lead.y,
      trackLeft: 0.5 + Math.random() * 0.5,
      holdLeft: TRACE_HOLD,
      locked: false,
      elite,
    });
  }

  function spawnVolley(host: ModifierHost) {
    const makes = host.getMadeCount();
    const n = rollVolleyCount(Math.max(1, lockdownIndex), makes);
    for (let i = 0; i < n; i++) {
      startTrace(host, Math.random() < eliteChance(makes) * (i === 0 ? 1 : 0.85));
    }
  }

  function yardHud(): YardLightsHud {
    let barLabel = "Yard Time";
    if (phase === "recess") {
      barLabel = "Yard Time";
    } else if (statusMode === "infraction") {
      barLabel = "Infraction";
    } else {
      barLabel = "Lock Down";
    }
    return {
      active: live,
      phase,
      bar01: 0,
      barLabel,
      // Top HUD stays cumulative score — status lives on the bar art only.
      status: null,
      statusFlash: false,
    };
  }

  function applyKnock(host: ModifierHost, b: Bolt) {
    const ball = host.getBallBody();
    const len = Math.hypot(b.vx, b.vy) || 1;
    const nx = b.vx / len;
    const ny = b.vy / len;
    // Away from the laser's travel direction.
    const power = KNOCK * (b.elite ? 1.28 : 1);
    ball.vx = -nx * power;
    ball.vy = -ny * power;
    // Extra launch so travel distance reads clearly.
    ball.vx *= 1.12;
    ball.vy *= 1.12;
    ball.omega += (Math.random() - 0.5) * 30;
    ball.squash = Math.min(ball.squash || 1, 0.7);
    if (ball.y + ball.r > host.world.floorY - 1) {
      ball.y = host.world.floorY - ball.r - 2;
    }
    host.notePrev();
    host.hit("bone");
  }

  function joltHoop(host: ModifierHost, fromY: number) {
    const h = host.getHoop();
    h.jolt = 1;
    h.joltDir = fromY < h.y ? -1 : 1;
    host.hit("bone");
  }

  function hitLight(side: "left" | "right", host: ModifierHost) {
    const fx = lightFx[side];
    fx.shake = 0.38;
    if (fx.out > 0) {
      // Stack stop time while already down.
      fx.out += LIGHT_OUT;
      host.hit("glass");
      return;
    }
    fx.out = LIGHT_OUT;
    fx.wake = 0;
    snapSpotHome(side, host.world);
    host.hit("glass");
  }

  /** Bolt ult: extinguish lamps whose emit sits on this vertical column. */
  function strikeColumn(host: ModifierHost, x: number) {
    if (!live || phase !== "lockdown") return;
    const world = host.world;
    const layout = loadSearchlightLayout();
    for (const side of [-1, 1] as const) {
      const key = side < 0 ? "left" : "right";
      const light = lightForSide(layout, side);
      if (!light) continue;
      const fx = lightFx[key];
      const spot = spots.find((s) => s.side === side);
      const bodyAng =
        fx.out > 0 || fx.wake > 0
          ? light.angle
          : liveBodyAngle(
              world,
              light,
              spot?.ax ?? world.w * 0.5,
              spot?.ay ?? world.floorY * 0.7,
            );
      const emit = placementEmit(world, light, bodyAng, wallQuad(world));
      const r = lightHitRadius(world, light) * 1.5;
      if (Math.abs(emit.x - x) <= r) hitLight(key, host);
    }
  }

  function fireFromTrace(t: Trace) {
    const dx = t.aimX - t.ox;
    const dy = t.aimY - t.oy;
    const len = Math.hypot(dx, dy) || 1;
    const spd = t.elite ? ELITE_SPD : BOLT_SPD;
    bolts.push({
      x: t.ox,
      y: t.oy,
      vx: (dx / len) * spd,
      vy: (dy / len) * spd,
      elite: t.elite,
      r: t.elite ? 7.2 : 5.6,
      bounces: 0,
    });
  }

  return {
    id: "yard-lights",

    begin(host) {
      live = false;
      dim = 0;
      timeAcc = 0;
      lockdownIndex = 0;
      statusMode = "patrol";
      lostLeft = 0;
      patrolTagLeft = 0;
      recessStartPending = true;
      lightFx = {
        left: { out: 0, shake: 0, wake: 0 },
        right: { out: 0, shake: 0, wake: 0 },
      };
      ensureBullet(BULLET_NORMAL);
      ensureBullet(BULLET_ELITE);
      enterRecess(host, false);
    },

    update(dt, host) {
      live = true;
      timeAcc += dt;
      const world = host.world;
      const ball = host.getBallBody();

      if (recessStartPending && phase === "recess") {
        recessStartPending = false;
        host.tag("放风时间");
      } else if (recessStartPending) {
        recessStartPending = false;
      }

      if (patrolTagLeft > 0) {
        patrolTagLeft = Math.max(0, patrolTagLeft - dt);
        if (patrolTagLeft <= 0 && phase === "lockdown" && hunt === "sweep") {
          host.tag("巡逻中");
        }
      }

      for (const side of ["left", "right"] as const) {
        const fx = lightFx[side];
        if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt);
        if (fx.out > 0) {
          fx.out = Math.max(0, fx.out - dt);
          if (fx.out <= 0) fx.wake = WAKE;
        } else if (fx.wake > 0) {
          fx.wake = Math.max(0, fx.wake - dt);
        }
      }

      if (lostLeft > 0) {
        lostLeft = Math.max(0, lostLeft - dt);
        if (lostLeft <= 0 && statusMode === "lost" && hunt === "sweep") {
          statusMode = "patrol";
          if (phase === "lockdown") host.tag("巡逻中");
        }
      }

      if (phase === "recess") {
        recessLeft -= dt;
        dim = Math.max(0, dim - dt * 1.2);
        clearTraces();
        hunt = "sweep";
        litAcc = 0;
        escapeAcc = 0;
        statusMode = "patrol";
        if (recessLeft <= 0) enterLockdown(host);
        return;
      }

      dim = Math.min(1, dim + dt * 1.4);
      const layout = loadSearchlightLayout();
      fireCool = Math.max(0, fireCool - dt);

      const bothDown = lightFx.left.out > 0 && lightFx.right.out > 0;
      if (bothDown) loseHuntTarget(host, false);

      // Ball wrapped off the side — lamps lose the chase.
      if (ballLostAtBorder(world, ball)) {
        loseHuntTarget(host, true);
      }

      // —— detect ball in living cones ——
      let litLeft = false;
      let litRight = false;
      for (const s of spots) {
        const sideKey = s.side < 0 ? "left" : "right";
        if (!lightHunting(lightFx[sideKey])) continue;
        const light = lightForSide(layout, s.side);
        if (!light) continue;
        const aim = clampAimHemisphere(
          s.side,
          placementPivot(world, light).x,
          placementPivot(world, light).y,
          s.ax,
          s.ay,
        );
        s.ax = aim.x;
        s.ay = aim.y;
        const bodyAng = liveBodyAngle(world, light, s.ax, s.ay);
        const maxLen = Math.hypot(world.w, world.floorY) * 1.05;
        const geo = coneGeometry(world, light, bodyAng, wallQuad(world), aim);
        if (inCone(geo.apex.x, geo.apex.y, s.ax, s.ay, ball.x, ball.y, geo.half, maxLen + geo.back)) {
          if (sideKey === "left") litLeft = true;
          else litRight = true;
        }
      }
      const ballLit =
        (lightHunting(lightFx.left) && litLeft) ||
        (lightHunting(lightFx.right) && litRight);

      const lead = ballLead(ball, 0.32);

      // Curfew phase pauses while hunting (track / lock); resumes on sweep.
      // Street cool-down fill keeps ticking separately via engine timer.
      if (hunt === "sweep") {
        lockdownLeft -= dt;
        for (const s of spots) {
          const sideKey = s.side < 0 ? "left" : "right";
          if (!lightHunting(lightFx[sideKey])) continue;
          const light = lightForSide(layout, s.side);
          s.retarget -= dt;
          if (s.retarget <= 0) {
            const next = pickTarget(world, ball, false, s.side, light);
            s.tx = next.x;
            s.ty = next.y;
            s.retarget = 1.4 + Math.random() * 2.2;
          }
          const k = 1 - Math.exp(-SWEEP * dt);
          s.ax += (s.tx - s.ax) * k;
          s.ay += (s.ty - s.ay) * k;
          if (light) {
            const piv = placementPivot(world, light);
            const c = clampAimHemisphere(s.side, piv.x, piv.y, s.ax, s.ay);
            s.ax = c.x;
            s.ay = c.y;
          }
          s.lock = 0;
        }
        litAcc = 0;
        escapeAcc = 0;
        if (ballLit && !bothDown) {
          hunt = "track";
          litAcc = 0;
          escapeAcc = 0;
          statusMode = "infraction";
          lostLeft = 0;
          patrolTagLeft = 0;
          host.tag("发现违规行为");
        }
      } else if (hunt === "track") {
        const k = 1 - Math.exp(-TRACK * dt);
        for (const s of spots) {
          const sideKey = s.side < 0 ? "left" : "right";
          if (!lightHunting(lightFx[sideKey])) continue;
          const light = lightForSide(layout, s.side);
          let tx = lead.x;
          let ty = lead.y;
          if (light) {
            const piv = placementPivot(world, light);
            const c = clampAimHemisphere(s.side, piv.x, piv.y, tx, ty);
            tx = c.x;
            ty = c.y;
          }
          s.ax += (tx - s.ax) * k;
          s.ay += (ty - s.ay) * k;
          const held = clampSpotAim(world, light, s.side, s.ax, s.ay);
          s.ax = held.x;
          s.ay = held.y;
          s.tx = tx;
          s.ty = ty;
          s.lock = litAcc;
        }
        if (ballLit) {
          litAcc += dt;
          escapeAcc = 0;
          if (litAcc >= LIT_LOCK) {
            hunt = "lock";
            litAcc = LIT_LOCK;
            for (const s of spots) {
              const sideKey = s.side < 0 ? "left" : "right";
              if (!lightHunting(lightFx[sideKey])) continue;
              const light = lightForSide(layout, s.side);
              let bx = ball.x;
              let by = ball.y;
              if (light) {
                const piv = placementPivot(world, light);
                const c = clampAimHemisphere(s.side, piv.x, piv.y, bx, by);
                bx = c.x;
                by = c.y;
              }
              s.ax = bx;
              s.ay = by;
              s.tx = bx;
              s.ty = by;
              s.lock = LIT_LOCK;
            }
            spawnVolley(host);
            fireCool = COOL;
            statusMode = "infraction";
          }
        } else {
          litAcc = 0;
          escapeAcc += dt;
          if (escapeAcc >= ESCAPE_TIME) {
            loseHuntTarget(host, true);
          }
        }
      } else {
        const snap = 1 - Math.exp(-LOCK_CHASE * dt);
        for (const s of spots) {
          const sideKey = s.side < 0 ? "left" : "right";
          if (!lightHunting(lightFx[sideKey])) continue;
          const light = lightForSide(layout, s.side);
          let bx = ball.x;
          let by = ball.y;
          if (light) {
            const piv = placementPivot(world, light);
            const c = clampAimHemisphere(s.side, piv.x, piv.y, bx, by);
            bx = c.x;
            by = c.y;
          }
          s.ax += (bx - s.ax) * snap;
          s.ay += (by - s.ay) * snap;
          const held = clampSpotAim(world, light, s.side, s.ax, s.ay);
          s.ax = held.x;
          s.ay = held.y;
          s.tx = bx;
          s.ty = by;
          s.lock = LIT_LOCK;
        }
        if (ballLit) {
          escapeAcc = 0;
          statusMode = "infraction";
          if (fireCool <= 0) {
            spawnVolley(host);
            fireCool = COOL;
          }
        } else {
          escapeAcc += dt;
          if (escapeAcc >= ESCAPE_TIME) {
            loseHuntTarget(host, true);
          }
        }
      }

      // —— red tracking lines ——
      for (const t of traces) {
        if (!t.locked) {
          const aim = ballLead(ball);
          const ease = 1 - Math.exp(-10 * dt);
          t.aimX += (aim.x - t.aimX) * ease;
          t.aimY += (aim.y - t.aimY) * ease;
          t.trackLeft -= dt;
          if (t.trackLeft <= 0) {
            t.locked = true;
            t.holdLeft = TRACE_HOLD;
            t.aimX = aim.x;
            t.aimY = aim.y;
          }
        } else {
          t.holdLeft -= dt;
          if (t.holdLeft <= 0) {
            fireFromTrace(t);
            t.holdLeft = -1;
          }
        }
      }
      traces = traces.filter((t) => !(t.locked && t.holdLeft < 0));

      if (lockdownLeft <= 0) enterRecess(host, true);
    },

    afterPhysics(dt, host) {
      // Bolts keep flying even after searchlights go dark (recess / extinguished).
      if (bolts.length === 0) return;
      const world = host.world;
      const ball = host.getBallBody();
      const hoop = host.getHoop();
      const layout = loadSearchlightLayout();

      for (const b of bolts) {
        if (b.x < -9000) continue;
        const x0 = b.x;
        const y0 = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.elite) {
          if (bounceElite(world, b, x0, y0)) continue;
        }

        const hitR = ball.r + b.r * 1.4;
        if (segmentHitsCircle(x0, y0, b.x, b.y, ball.x, ball.y, hitR)) {
          applyKnock(host, b);
          b.vx = 0;
          b.vy = 0;
          b.x = -9999;
          continue;
        }

        if (segmentHitsCircle(x0, y0, b.x, b.y, hoop.x, hoop.y, hoopHitRadius(hoop))) {
          joltHoop(host, y0);
          b.x = -9999;
          continue;
        }

        for (const side of [-1, 1] as const) {
          const key = side < 0 ? "left" : "right";
          const light = lightForSide(layout, side);
          if (!light) continue;
          const spot = spots.find((s) => s.side === side);
          const fx = lightFx[key];
          // While stopped, stay at rest pose so stacked hits still land on the oval.
          const bodyAng =
            fx.out > 0
              ? light.angle
              : liveBodyAngle(
                  world,
                  light,
                  spot?.ax ?? world.w * 0.5,
                  spot?.ay ?? world.floorY * 0.7,
                );
          const emit = placementEmit(world, light, bodyAng, wallQuad(world));
          if (segmentHitsCircle(x0, y0, b.x, b.y, emit.x, emit.y, lightHitRadius(world, light))) {
            hitLight(key, host);
            b.x = -9999;
            break;
          }
        }
      }

      bolts = bolts.filter((b) => {
        if (b.x < -9000) return false;
        if (b.elite) return true;
        return !outsidePlay(world, b.x, b.y);
      });
    },

    skipBoard() {
      return false;
    },
    skipBrace() {
      return false;
    },
    onScored() {
      return false;
    },
    canScore() {
      return true;
    },

    strikeColumn(host, x) {
      strikeColumn(host, x);
    },

    drawWorldBack(ctx, world, time) {
      const layout = loadSearchlightLayout();
      if (dim > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(4, 8, 14, ${0.52 * dim})`;
        ctx.fillRect(0, 0, world.w, world.floorY + (world.h - world.floorY) * 0.35);
        ctx.restore();
      }

      for (const side of [-1, 1] as const) {
        const key = side < 0 ? "left" : "right";
        const light = lightForSide(layout, side);
        const spot = spots.find((s) => s.side === side);
        const aimX = spot?.ax ?? world.w * 0.5;
        const aimY = spot?.ay ?? world.floorY * 0.7;
        if (!light) continue;
        const fx = lightFx[key];
        // Stopped / waking: hold authored rest pose.
        const bodyAng =
          fx.out > 0 || fx.wake > 0 || !(live && (phase === "lockdown" || dim > 0.05))
            ? light.angle
            : liveBodyAngle(world, light, aimX, aimY);
        drawSearchlightSprite(ctx, world, layout, light, bodyAng, fx, timeAcc || time);
      }
    },

    drawWorld(ctx, world, time) {
      if (!live) {
        void time;
        return;
      }
      const layout = loadSearchlightLayout();
      const showBeams = phase === "lockdown" || dim > 0.05;

      if (showBeams) {
        for (const s of spots) {
          const key = s.side < 0 ? "left" : "right";
          const light = lightForSide(layout, s.side);
          if (!light) continue;
          const fx = lightFx[key];
          const bodyAng =
            fx.out > 0 || fx.wake > 0
              ? light.angle
              : liveBodyAngle(world, light, s.ax, s.ay);
          drawSearchlightBeam(ctx, world, light, {
            locking: s.lock > 0.02 && lightHunting(fx),
            bodyAngle: bodyAng,
            quad: wallQuad(world),
            disabled: fx.out > 0,
            pulse: wakePulse(fx),
            aim: { x: s.ax, y: s.ay },
          });
        }

        // Red tracking / locked aim lines.
        for (const t of traces) {
          const dx = t.aimX - t.ox;
          const dy = t.aimY - t.oy;
          const len = Math.hypot(dx, dy) || 1;
          const reach = Math.hypot(world.w, world.floorY) * 1.35;
          const ex = t.ox + (dx / len) * reach;
          const ey = t.oy + (dy / len) * reach;
          ctx.save();
          ctx.strokeStyle = t.locked
            ? t.elite
              ? "rgba(255,90,40,0.95)"
              : "rgba(255,48,48,0.9)"
            : t.elite
              ? "rgba(255,120,60,0.55)"
              : "rgba(255,60,60,0.5)";
          ctx.lineWidth = TRACE_LINE;
          ctx.setLineDash(t.locked ? [] : [10, 8]);
          ctx.beginPath();
          ctx.moveTo(t.ox, t.oy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      for (const b of bolts) drawBoltSprite(ctx, b);
      void time;
    },

    drawScreen() {},

    hud() {
      return yardHud();
    },

    end() {
      live = false;
      spots = [];
      clearTraces();
      bolts = [];
      phase = "recess";
      recessLeft = RECESS;
      lockdownLeft = LOCKDOWN;
      dim = 0;
      warned = false;
      hunt = "sweep";
      litAcc = 0;
      escapeAcc = 0;
      fireCool = 0;
      lockdownIndex = 0;
      statusMode = "patrol";
      lostLeft = 0;
      patrolTagLeft = 0;
      recessStartPending = false;
      lightFx = {
        left: { out: 0, shake: 0, wake: 0 },
        right: { out: 0, shake: 0, wake: 0 },
      };
    },
  };
}
