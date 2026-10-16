import type { World } from "./types";

/**
 * High-speed train roof, phase 1.
 * Owns the speed cycle and the three parallax offsets. Shot physics stay in
 * the engine. The ground is one train car in side view (fixed). The street
 * sky and clouds sit behind it. Far / mid / near are objects only — no band
 * fill — standing on the same horizon. Far mountains are tallest, then the
 * treeline, then the poles, which rise a little above the carriage. They
 * scroll backward at different rates.
 *
 * Scenery moves left (backward) as `trainSpeed` rises. Offsets are cumulative
 * pixels; the renderer wraps each layer by its tile width so the loop is seamless
 * at any viewport size.
 */

export type TrainPhase = "accel" | "cruise" | "decel";

/** Fixed rhythm: accelerate, hold, decelerate, then repeat. Seconds. */
export const TRAIN_ACCEL_SEC = 4;
export const TRAIN_CRUISE_SEC = 5;
export const TRAIN_DECEL_SEC = 4;

/**
 * Near-layer speed in pixels per second.
 * Decel ends at MIN; accel ends at MAX; cruise holds MAX.
 */
export const TRAIN_SPEED_MIN = 90;
export const TRAIN_SPEED_MAX = 540;

/** Near / mid / far scroll multipliers. Near is the train's own speed. */
export const TRAIN_PARALLAX = {
  near: 1,
  mid: 0.45,
  far: 0.15,
} as const;

export const TRAIN_PHASE_LABEL: Record<TrainPhase, string> = {
  accel: "加速",
  cruise: "匀速",
  decel: "减速",
};

export type TrainScroll = {
  phase: TrainPhase;
  /** Seconds elapsed inside the current phase. */
  phaseT: number;
  /** Near-layer speed, px/s. Positive scrolls scenery backward (left). */
  trainSpeed: number;
  near: number;
  mid: number;
  far: number;
};

const state: TrainScroll = {
  phase: "accel",
  phaseT: 0,
  trainSpeed: TRAIN_SPEED_MIN,
  near: 0,
  mid: 0,
  far: 0,
};

export function resetTrainScroll() {
  state.phase = "accel";
  state.phaseT = 0;
  state.trainSpeed = TRAIN_SPEED_MIN;
  state.near = 0;
  state.mid = 0;
  state.far = 0;
}

export function getTrainScroll(): TrainScroll {
  return { ...state };
}

export function trainSpeed01(speed = state.trainSpeed) {
  const span = TRAIN_SPEED_MAX - TRAIN_SPEED_MIN;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (speed - TRAIN_SPEED_MIN) / span));
}

/** Pixel shift of a tiling strip. Equal offsets one tile apart land on the same seam. */
export function trainScrollShift(offset: number, tileW: number) {
  if (!(tileW > 0) || !Number.isFinite(offset)) return 0;
  const m = offset % tileW;
  return m < 0 ? m + tileW : m;
}

function phaseDuration(phase: TrainPhase) {
  if (phase === "accel") return TRAIN_ACCEL_SEC;
  if (phase === "decel") return TRAIN_DECEL_SEC;
  return TRAIN_CRUISE_SEC;
}

function nextPhase(phase: TrainPhase): TrainPhase {
  if (phase === "accel") return "cruise";
  if (phase === "cruise") return "decel";
  return "accel";
}

function clamp01(u: number) {
  return Math.max(0, Math.min(1, u));
}

function speedAt(phase: TrainPhase, u: number) {
  const t = clamp01(u);
  if (phase === "accel") return TRAIN_SPEED_MIN + (TRAIN_SPEED_MAX - TRAIN_SPEED_MIN) * t;
  if (phase === "decel") return TRAIN_SPEED_MAX + (TRAIN_SPEED_MIN - TRAIN_SPEED_MAX) * t;
  return TRAIN_SPEED_MAX;
}

function addScroll(distance: number) {
  state.near += distance * TRAIN_PARALLAX.near;
  state.mid += distance * TRAIN_PARALLAX.mid;
  state.far += distance * TRAIN_PARALLAX.far;
}

/**
 * Advance the cycle by `dt` seconds. Linear ramps are integrated with the
 * trapezoid of each slice, so subdividing a phase does not change the distance.
 */
export function stepTrainScroll(dt: number) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  let left = dt;
  for (let guard = 0; guard < 32 && left > 1e-8; guard++) {
    const dur = phaseDuration(state.phase);
    const room = dur - state.phaseT;
    if (room <= 1e-8) {
      state.phase = nextPhase(state.phase);
      state.phaseT = 0;
      state.trainSpeed = speedAt(state.phase, 0);
      continue;
    }
    const slice = Math.min(left, room);
    const u0 = state.phaseT / dur;
    const u1 = (state.phaseT + slice) / dur;
    const v0 = speedAt(state.phase, u0);
    const v1 = speedAt(state.phase, u1);
    addScroll(((v0 + v1) * 0.5) * slice);
    state.phaseT += slice;
    state.trainSpeed = v1;
    left -= slice;
    if (state.phaseT >= dur - 1e-8) {
      state.phase = nextPhase(state.phase);
      state.phaseT = 0;
      state.trainSpeed = speedAt(state.phase, 0);
    }
  }
}

function paintTiles(
  offset: number,
  tileW: number,
  viewW: number,
  draw: (x: number) => void,
) {
  const shift = trainScrollShift(offset, tileW);
  for (let x = -shift; x < viewW; x += tileW) draw(x);
}

/**
 * Silhouette heights in multiples of the carriage (roof to bottom of frame).
 * Every layer's feet sit on the roof line. Far stays above mid, mid above near.
 */
const FAR_HEIGHT = [2.45, 2.75] as const;
const MID_HEIGHT = [1.7, 1.95, 1.65, 2.05, 1.8, 1.9] as const;
const POLE_HEIGHT = 1.32;

/** Blue-white triangle. The two faces meet at the peak; the base is the horizon. */
function drawMountain(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  height: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height);
  ctx.lineTo(cx - halfW, baseY);
  ctx.lineTo(cx, baseY);
  ctx.closePath();
  ctx.fillStyle = "#f4f8fc";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height);
  ctx.lineTo(cx + halfW, baseY);
  ctx.lineTo(cx, baseY);
  ctx.closePath();
  ctx.fillStyle = "#6aa6d0";
  ctx.fill();
}

function drawFarObjects(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  carH: number,
  tileW: number,
) {
  const peaks = [
    { fx: 0.24, h: FAR_HEIGHT[0], w: 0.18 },
    { fx: 0.74, h: FAR_HEIGHT[1], w: 0.16 },
  ] as const;
  for (const p of peaks) {
    drawMountain(ctx, x + tileW * p.fx, floorY, tileW * p.w, carH * p.h);
  }
}

function drawMidObjects(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  carH: number,
  tileW: number,
) {
  const n = 12;
  const step = tileW / n;
  const halfW = step * 1.15;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i <= n; i++) {
      const th = carH * (pass === 0 ? MID_HEIGHT[i % MID_HEIGHT.length]! : 1.68);
      const tx = x + (i + (pass === 0 ? 0 : 0.5)) * step;
      if (pass === 1 && i === n) continue;
      ctx.fillStyle = (i + pass) % 2 === 0 ? "#3d6248" : "#2f5a3c";
      ctx.beginPath();
      ctx.moveTo(tx, floorY - th);
      ctx.lineTo(tx + halfW, floorY);
      ctx.lineTo(tx - halfW, floorY);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawNearObjects(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  carH: number,
  tileW: number,
  u: number,
) {
  const height = carH * POLE_HEIGHT;
  const armY = floorY - height;
  const spots = [0.08, 0.36, 0.64, 0.92] as const;
  ctx.strokeStyle = "#3a342c";
  ctx.lineWidth = Math.max(1.25, 1.5 * u);
  ctx.beginPath();
  for (const drop of [0, 6 * u]) {
    let prev = x;
    ctx.moveTo(prev, armY + drop);
    for (const fx of spots) {
      const x1 = x + tileW * fx;
      ctx.quadraticCurveTo((prev + x1) / 2, armY + drop + 7 * u, x1, armY + drop);
      prev = x1;
    }
    const end = x + tileW;
    ctx.quadraticCurveTo((prev + end) / 2, armY + drop + 7 * u, end, armY + drop);
  }
  ctx.stroke();
  ctx.fillStyle = "#2c2824";
  for (const fx of spots) {
    const px = x + tileW * fx;
    ctx.fillRect(px - 1.8 * u, armY, 3.6 * u, height);
    ctx.fillRect(px - 12 * u, armY, 24 * u, Math.max(3, 3.2 * u));
  }
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#1b2126";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = "#9aa3ab";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "#3d464e";
  ctx.fill();
}

/**
 * One carriage in side view, cropped by the narrow frame. The roof is the
 * play surface at floorY. The car does not scroll — the player is standing on it.
 */
function drawTrainCar(ctx: CanvasRenderingContext2D, world: World, scroll: TrainScroll) {
  const { w, h, floorY } = world;
  const u = w / 390;
  const depth = Math.max(8, h - floorY);
  const bodyTop = floorY;
  const wheelR = Math.max(7, Math.min(15 * u, depth * 0.16));
  const bodyBot = h - wheelR * 1.15;
  const gang = Math.min(34 * u, w * 0.1);

  ctx.fillStyle = "#f3f5f7";
  ctx.fillRect(0, bodyTop, w, Math.max(1, bodyBot - bodyTop));

  ctx.fillStyle = "#2c333a";
  ctx.fillRect(0, bodyTop, gang, Math.max(1, bodyBot - bodyTop));
  ctx.fillStyle = "#8b949c";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(3 * u + i * gang * 0.28, bodyTop + 8 * u, Math.max(2, 3 * u), Math.max(8, (bodyBot - bodyTop) * 0.5));
  }

  const bandTop = bodyTop + Math.max(16 * u, depth * 0.16);
  const bandH = Math.max(22 * u, Math.min(48 * u, (bodyBot - bandTop) * 0.42));
  ctx.fillStyle = "#1b4e86";
  ctx.fillRect(gang, bandTop - 3 * u, w - gang, bandH + 6 * u);

  const doorW = 26 * u;
  const doorX = gang + (w - gang) * 0.34;
  const doorTop = bandTop - 8 * u;
  const doorH = Math.min(bodyBot - doorTop - 10 * u, bandH + 22 * u);
  ctx.fillStyle = "#163e6c";
  ctx.fillRect(doorX, doorTop, doorW, doorH);
  ctx.fillStyle = "#9fd4ef";
  ctx.fillRect(doorX + 4 * u, doorTop + 4 * u, doorW - 8 * u, doorH * 0.28);

  const winW = 34 * u;
  const winH = bandH * 0.62;
  const winY = bandTop + (bandH - winH) * 0.5;
  const step = winW + 12 * u;
  ctx.fillStyle = "#b7e3f6";
  for (let x = gang + 12 * u; x < w; x += step) {
    if (x + winW > doorX && x < doorX + doorW) continue;
    ctx.fillStyle = "#b7e3f6";
    ctx.fillRect(x, winY, winW, winH);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(x + 2 * u, winY + 2 * u, winW * 0.28, winH * 0.35);
  }

  ctx.fillStyle = "#c4473a";
  const stripeY = bandTop + bandH + 8 * u;
  if (stripeY < bodyBot - 8 * u) ctx.fillRect(gang, stripeY, w - gang, Math.max(3, 4 * u));

  ctx.fillStyle = "#2a3138";
  ctx.fillRect(0, bodyBot - 7 * u, w, 7 * u);
  ctx.fillStyle = "#c5ccd3";
  ctx.fillRect(0, floorY, w, Math.max(3, 5 * u));
  ctx.fillStyle = "#8d98a3";
  ctx.fillRect(0, floorY, w, Math.max(1.5, 2 * u));

  const wy = Math.min(h - wheelR - 1, bodyBot + wheelR * 0.15);
  const bogie = gang + (w - gang) * 0.72;
  ctx.fillStyle = "#242a30";
  ctx.fillRect(bogie - 26 * u, wy - 5 * u, 52 * u, 6 * u);
  drawWheel(ctx, bogie - 16 * u, wy, wheelR);
  drawWheel(ctx, bogie + 16 * u, wy, wheelR);

  const pw = 92 * u;
  const ph = 16 * u;
  const px = w - pw - 10 * u;
  const py = bodyTop + 6 * u;
  if (py + ph < bandTop - 2 * u) {
    ctx.fillStyle = "rgba(18, 22, 28, 0.9)";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#e0b44a";
    ctx.font = `600 ${Math.max(10, Math.round(11 * u))}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(TRAIN_PHASE_LABEL[scroll.phase], px + 6 * u, py + ph * 0.5);
    const bars = 7;
    const filled = Math.round(trainSpeed01(scroll.trainSpeed) * bars);
    const bw = 6 * u;
    const gap = 2 * u;
    let bx = px + 40 * u;
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = i < filled ? "#e0b44a" : "rgba(224, 180, 74, 0.28)";
      ctx.fillRect(bx, py + ph * 0.32, bw, ph * 0.36);
      bx += bw + gap;
    }
  }
}

/**
 * Scenery objects over the already-drawn street sky. Nothing here fills a band:
 * gaps stay transparent so the sky and clouds show through. The car is opaque.
 */
export function drawTrainBackdrop(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h, floorY } = world;
  const scroll = getTrainScroll();
  const tileW = Math.max(1, w);
  const u = w / 390;
  const carH = Math.max(8, h - floorY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, floorY);
  ctx.clip();
  paintTiles(scroll.far, tileW, w, (x) => drawFarObjects(ctx, x, floorY, carH, tileW));
  paintTiles(scroll.mid, tileW, w, (x) => drawMidObjects(ctx, x, floorY, carH, tileW));
  paintTiles(scroll.near, tileW, w, (x) => drawNearObjects(ctx, x, floorY, carH, tileW, u));
  ctx.restore();
  drawTrainCar(ctx, world, scroll);
}
