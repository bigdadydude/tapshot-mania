import type { World } from "./types";

/**
 * High-speed train roof, phase 1.
 * Owns the speed cycle and the three parallax offsets. Shot physics stay in
 * the engine. The ground is one train car in side view (fixed). Above that
 * roof, far / mid / near scenery bands scroll backward at different rates.
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

/** Fractions of the roof line. Each band is clipped so the three layers stay stacked. */
const FAR_BAND = 0.4;
const MID_BAND = 0.7;

function clipBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  bot: number,
  draw: () => void,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, Math.max(1, bot - top));
  ctx.clip();
  draw();
  ctx.restore();
}

function fillRidge(
  ctx: CanvasRenderingContext2D,
  x: number,
  tileW: number,
  baseY: number,
  amp: number,
  freq: number,
  color: string,
) {
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = baseY - amp * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq));
    ctx.lineTo(x + t * tileW, y);
  }
  ctx.lineTo(x + tileW, baseY + 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Edge heights match so the next tile continues the silhouette. */
function fillSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  tileW: number,
  baseY: number,
  span: number,
  pts: readonly (readonly [number, number])[],
  color: string,
) {
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  for (const [t, k] of pts) ctx.lineTo(x + t * tileW, baseY - span * k);
  ctx.lineTo(x + tileW, baseY + 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFarTile(ctx: CanvasRenderingContext2D, x: number, bandTop: number, bandBot: number, tileW: number, u: number) {
  const span = bandBot - bandTop;
  // One tall peak per tile. A repeating sine aliased the slow layer into a fast one.
  fillSilhouette(ctx, x, tileW, bandBot, span, [
    [0, 0.2],
    [0.14, 0.48],
    [0.28, 0.86],
    [0.4, 0.38],
    [0.56, 0.3],
    [0.72, 0.5],
    [0.86, 0.24],
    [1, 0.2],
  ], "#a9bdd0");
  fillSilhouette(ctx, x, tileW, bandBot, span, [
    [0, 0.12],
    [0.22, 0.26],
    [0.4, 0.14],
    [0.58, 0.46],
    [0.74, 0.2],
    [0.88, 0.28],
    [1, 0.12],
  ], "#6d8498");
  const mx = x + tileW * 0.28;
  const peakY = bandBot - span * 0.86;
  ctx.fillStyle = "#3c5366";
  ctx.fillRect(mx - Math.max(1, u), peakY - span * 0.16, Math.max(2, 2 * u), span * 0.16);
  ctx.fillRect(mx - 6 * u, peakY - span * 0.16, 12 * u, Math.max(2, 2 * u));
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [fx, fy, radius] of [
    [0.16, 0.18, 36],
    [0.48, 0.1, 22],
    [0.7, 0.22, 40],
  ] as const) {
    const cx = x + tileW * fx;
    const cy = bandTop + span * fy;
    const rx = radius * u;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + rx * 0.55, cy + rx * 0.06, rx * 0.62, rx * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMidTile(ctx: CanvasRenderingContext2D, x: number, bandTop: number, bandBot: number, tileW: number, u: number) {
  const span = bandBot - bandTop;
  fillRidge(ctx, x, tileW, bandBot, span * 0.42, 1, "#7f9a72");
  fillRidge(ctx, x, tileW, bandBot + 1, span * 0.22, 3, "#5d7c58");
  const trees = [0.1, 0.26, 0.44, 0.62, 0.8];
  trees.forEach((fx, i) => {
    const tx = x + tileW * fx;
    const th = span * (0.46 + (i % 3) * 0.12);
    ctx.fillStyle = "#2c4a34";
    ctx.fillRect(tx - 1.3 * u, bandBot - th * 0.22, 2.6 * u, th * 0.22);
    ctx.fillStyle = "#3d6248";
    ctx.beginPath();
    ctx.moveTo(tx, bandBot - th);
    ctx.lineTo(tx + 8 * u, bandBot - th * 0.28);
    ctx.lineTo(tx - 8 * u, bandBot - th * 0.28);
    ctx.closePath();
    ctx.fill();
  });
}

function drawNearTile(ctx: CanvasRenderingContext2D, x: number, bandTop: number, bandBot: number, tileW: number, u: number) {
  const span = bandBot - bandTop;
  const blocks = [0.06, 0.28, 0.5, 0.74];
  blocks.forEach((fx, i) => {
    const bw = tileW * 0.16;
    const bh = span * (0.45 + (i % 3) * 0.16);
    const bx = x + tileW * fx;
    const by = bandBot - bh;
    ctx.fillStyle = i % 2 === 0 ? "#8a6244" : "#6e5340";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#d9c7a4";
    const cols = 2;
    const rows = Math.max(2, Math.floor(bh / (12 * u)));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillRect(bx + (6 + col * 14) * u, by + (6 + row * 12) * u, 7 * u, 6 * u);
      }
    }
  });
  ctx.fillStyle = "#2a2622";
  for (const fx of [0.18, 0.46, 0.78]) {
    const px = x + tileW * fx;
    ctx.fillRect(px - 1.4 * u, bandTop + span * 0.08, 2.8 * u, bandBot - (bandTop + span * 0.08));
    ctx.fillRect(px - 6 * u, bandTop + span * 0.08, 12 * u, 3 * u);
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

/** Side view of one car, with three scrolling bands stacked above the roof. */
export function drawTrainBackdrop(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h, floorY } = world;
  const scroll = getTrainScroll();
  const tileW = Math.max(1, w);
  const u = w / 390;
  const farBot = floorY * FAR_BAND;
  const midBot = floorY * MID_BAND;
  ctx.save();

  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#7eabc4");
  sky.addColorStop(1, "#d5e2ea");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255, 244, 220, 0.92)";
  ctx.beginPath();
  ctx.arc(w * 0.8, farBot * 0.28, Math.max(12, w * 0.032), 0, Math.PI * 2);
  ctx.fill();

  clipBand(ctx, w, 0, farBot, () => {
    paintTiles(scroll.far, tileW, w, (x) => drawFarTile(ctx, x, 0, farBot, tileW, u));
  });
  clipBand(ctx, w, farBot, midBot, () => {
    ctx.fillStyle = "#d7e4cf";
    ctx.fillRect(0, farBot, w, midBot - farBot);
    paintTiles(scroll.mid, tileW, w, (x) => drawMidTile(ctx, x, farBot, midBot, tileW, u));
  });
  clipBand(ctx, w, midBot, floorY, () => {
    ctx.fillStyle = "#e7d7c4";
    ctx.fillRect(0, midBot, w, floorY - midBot);
    paintTiles(scroll.near, tileW, w, (x) => drawNearTile(ctx, x, midBot, floorY, tileW, u));
  });

  ctx.fillStyle = "rgba(40, 48, 56, 0.28)";
  ctx.fillRect(0, farBot - 1, w, 2);
  ctx.fillRect(0, midBot - 1, w, 2);

  drawTrainCar(ctx, world, scroll);
  ctx.restore();
}
