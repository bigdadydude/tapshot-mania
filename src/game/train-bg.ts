import type { World } from "./types";

/**
 * High-speed train roof, phase 1.
 * Owns the speed cycle and the three parallax offsets. Shot physics stay in
 * the engine; this module only scrolls the backdrop behind a fixed roof.
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
  const steps = 32;
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

function drawTree(ctx: CanvasRenderingContext2D, x: number, ground: number, h: number, u: number) {
  ctx.fillStyle = "#2f4a38";
  ctx.fillRect(x - 1.4 * u, ground - h * 0.28, 2.8 * u, h * 0.28);
  ctx.fillStyle = "#3d6248";
  ctx.beginPath();
  ctx.moveTo(x, ground - h);
  ctx.lineTo(x + 9 * u, ground - h * 0.28);
  ctx.lineTo(x - 9 * u, ground - h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2c4d38";
  ctx.beginPath();
  ctx.moveTo(x, ground - h * 0.92);
  ctx.lineTo(x + 6.5 * u, ground - h * 0.48);
  ctx.lineTo(x - 6.5 * u, ground - h * 0.48);
  ctx.closePath();
  ctx.fill();
}

function strokeRidge(
  ctx: CanvasRenderingContext2D,
  x: number,
  tileW: number,
  baseY: number,
  amp: number,
  freq: number,
  color: string,
  width: number,
) {
  ctx.beginPath();
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = baseY - amp * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x + t * tileW, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawMast(ctx: CanvasRenderingContext2D, x: number, base: number, u: number) {
  ctx.fillStyle = "#3c5160";
  ctx.fillRect(x - u, base - 52 * u, 2 * u, 52 * u);
  ctx.beginPath();
  ctx.moveTo(x - 7 * u, base - 46 * u);
  ctx.lineTo(x, base - 62 * u);
  ctx.lineTo(x + 7 * u, base - 46 * u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e0b44a";
  ctx.fillRect(x - 1.2 * u, base - 64 * u, 2.4 * u, 3 * u);
}

function drawFarTile(ctx: CanvasRenderingContext2D, x: number, world: World, tileW: number) {
  const { floorY } = world;
  const u = world.w / 390;
  fillRidge(ctx, x, tileW, floorY * 0.5, floorY * 0.12, 1, "#9aafbe");
  fillRidge(ctx, x, tileW, floorY * 0.6, floorY * 0.07, 2, "#5d7384");
  strokeRidge(ctx, x, tileW, floorY * 0.6, floorY * 0.07, 2, "#314554", Math.max(1.5, 2 * u));
  const base = floorY * 0.46;
  drawMast(ctx, x + tileW * 0.22, base, u);
  drawMast(ctx, x + tileW * 0.7, base, u);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const clouds: [number, number, number][] = [
    [0.18, 0.16, 46],
    [0.52, 0.1, 34],
    [0.78, 0.2, 52],
  ];
  for (const [fx, fy, rw] of clouds) {
    const cx = x + tileW * fx;
    const cy = floorY * fy;
    const rx = rw * u;
    const ry = rx * 0.42;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + rx * 0.55, cy + ry * 0.15, rx * 0.72, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMidTile(ctx: CanvasRenderingContext2D, x: number, world: World, tileW: number) {
  const { floorY } = world;
  const u = world.w / 390;
  const ground = floorY * 0.78;
  fillRidge(ctx, x, tileW, ground, floorY * 0.08, 1, "#7d9a78");
  fillRidge(ctx, x, tileW, ground + 2, floorY * 0.045, 3, "#5e7d62");
  const trees = [0.12, 0.28, 0.47, 0.63, 0.81];
  trees.forEach((fx, i) => {
    drawTree(ctx, x + tileW * fx, ground - 2, (28 + (i % 3) * 10) * u, u);
  });
}

function drawNearTile(ctx: CanvasRenderingContext2D, x: number, world: World, tileW: number) {
  const { floorY } = world;
  const u = world.w / 390;
  const gravelTop = floorY - 22 * u;
  ctx.fillStyle = "#6e675e";
  ctx.fillRect(x, gravelTop, tileW + 1, floorY - gravelTop);
  const ties = 16;
  const gap = tileW / ties;
  ctx.fillStyle = "#3a342e";
  for (let i = 0; i < ties; i++) {
    ctx.fillRect(x + i * gap, gravelTop + 6 * u, gap * 0.42, 8 * u);
  }
  ctx.fillStyle = "#e0b44a";
  for (let i = 0; i < 4; i++) {
    const mx = x + (i + 0.5) * (tileW / 4);
    const my = gravelTop + 4 * u;
    ctx.beginPath();
    ctx.moveTo(mx, my - 3.5 * u);
    ctx.lineTo(mx + 3.5 * u, my);
    ctx.lineTo(mx, my + 3.5 * u);
    ctx.lineTo(mx - 3.5 * u, my);
    ctx.closePath();
    ctx.fill();
  }

  const poleFracs = [0, 0.34, 0.67];
  const wireY = floorY * 0.9;
  const sag = 10 * u;
  ctx.strokeStyle = "#1c2128";
  ctx.lineWidth = Math.max(1, 1.25 * u);
  ctx.beginPath();
  for (let i = 0; i < poleFracs.length; i++) {
    const x0 = x + tileW * poleFracs[i]!;
    const x1 = i + 1 < poleFracs.length ? x + tileW * poleFracs[i + 1]! : x + tileW;
    ctx.moveTo(x0, wireY);
    ctx.quadraticCurveTo((x0 + x1) / 2, wireY + sag, x1, wireY);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < poleFracs.length; i++) {
    const x0 = x + tileW * poleFracs[i]!;
    const x1 = i + 1 < poleFracs.length ? x + tileW * poleFracs[i + 1]! : x + tileW;
    ctx.moveTo(x0, wireY + 5 * u);
    ctx.quadraticCurveTo((x0 + x1) / 2, wireY + sag + 5 * u, x1, wireY + 5 * u);
  }
  ctx.stroke();

  ctx.fillStyle = "#24282e";
  for (const fx of poleFracs) {
    const px = x + tileW * fx;
    ctx.fillRect(px - 1.6 * u, wireY, 3.2 * u, floorY - wireY);
    ctx.fillRect(px - 7 * u, wireY, 14 * u, 3 * u);
  }

  const shedX = x + tileW * 0.42;
  const shedW = tileW * 0.16;
  const shedH = 36 * u;
  const shedTop = gravelTop - shedH;
  ctx.fillStyle = "#4e463f";
  ctx.fillRect(shedX, shedTop, shedW, shedH);
  ctx.fillStyle = "#3a342e";
  ctx.beginPath();
  ctx.moveTo(shedX - 4 * u, shedTop);
  ctx.lineTo(shedX + shedW * 0.5, shedTop - 10 * u);
  ctx.lineTo(shedX + shedW + 4 * u, shedTop);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(232, 214, 170, 0.7)";
  const winW = 7 * u;
  const winH = 8 * u;
  ctx.fillRect(shedX + 6 * u, shedTop + 10 * u, winW, winH);
  ctx.fillRect(shedX + shedW - 6 * u - winW, shedTop + 10 * u, winW, winH);
}

function drawStreaks(ctx: CanvasRenderingContext2D, world: World, scroll: TrainScroll) {
  const { w, floorY } = world;
  const u = w / 390;
  const t = trainSpeed01(scroll.trainSpeed);
  const count = 3 + Math.round(t * 7);
  const len = (22 + t * 96) * u;
  const span = w + len + 48 * u;
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + t * 0.38})`;
  ctx.lineWidth = Math.max(1, u);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const seed = Math.sin((i + 1) * 127.1) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const travel = trainScrollShift(scroll.near + i * 173, span);
    const x1 = w - travel;
    const y = floorY * (0.06 + frac * 0.24);
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 - len, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRoof(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h, floorY } = world;
  const u = w / 390;
  const depth = h - floorY;
  ctx.fillStyle = "#3e4652";
  ctx.fillRect(0, floorY, w, depth);
  const panel = Math.max(56, w / 6);
  for (let x = 0, i = 0; x < w; x += panel, i++) {
    ctx.fillStyle = i % 2 === 0 ? "#46505c" : "#3a424e";
    ctx.fillRect(x + u, floorY + 14 * u, panel - 2 * u, Math.max(8, depth - 28 * u));
    ctx.fillStyle = "rgba(20, 24, 30, 0.35)";
    ctx.fillRect(x + panel - u, floorY + 14 * u, u, Math.max(8, depth - 28 * u));
  }
  ctx.strokeStyle = "rgba(214, 220, 228, 0.28)";
  ctx.lineWidth = Math.max(1.5, 2 * u);
  const cx = w * 0.5;
  const cy = floorY + depth * 0.48;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(depth * 0.26, w * 0.11), 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.18, cy);
  ctx.lineTo(w * 0.82, cy);
  ctx.stroke();
  ctx.fillStyle = "#2a3038";
  ctx.fillRect(0, floorY, w, 5 * u);
  ctx.fillStyle = "#e0b44a";
  ctx.fillRect(0, floorY + 5 * u, w, 3 * u);
}

function drawSpeedPlate(ctx: CanvasRenderingContext2D, world: World, scroll: TrainScroll) {
  const { w, h } = world;
  const u = w / 390;
  const pw = 112 * u;
  const ph = 30 * u;
  const x = w - pw - 10 * u;
  const y = h - ph - 10 * u;
  const r = 6 * u;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pw, y, x + pw, y + ph, r);
  ctx.arcTo(x + pw, y + ph, x, y + ph, r);
  ctx.arcTo(x, y + ph, x, y, r);
  ctx.arcTo(x, y, x + pw, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(22, 26, 32, 0.88)";
  ctx.fill();
  ctx.fillStyle = "#e0b44a";
  ctx.font = `600 ${Math.max(11, Math.round(13 * u))}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(TRAIN_PHASE_LABEL[scroll.phase], x + 8 * u, y + ph * 0.36);
  const bars = 8;
  const filled = Math.round(trainSpeed01(scroll.trainSpeed) * bars);
  const bw = 8 * u;
  const gap = 2.2 * u;
  const bx = x + 8 * u;
  const by = y + ph * 0.7;
  for (let i = 0; i < bars; i++) {
    ctx.fillStyle = i < filled ? "#e0b44a" : "rgba(224, 180, 74, 0.28)";
    ctx.fillRect(bx + i * (bw + gap), by, bw, 3.5 * u);
  }
  ctx.restore();
}

/** Placeholder train roof: sky, three scrolling bands, and a fixed platform. */
export function drawTrainBackdrop(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h, floorY } = world;
  const scroll = getTrainScroll();
  const tileW = Math.max(1, w);
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, floorY);
  sky.addColorStop(0, "#7eabc4");
  sky.addColorStop(0.55, "#c9d5cf");
  sky.addColorStop(1, "#e4d7bf");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255, 244, 220, 0.9)";
  ctx.beginPath();
  ctx.arc(w * 0.78, floorY * 0.16, Math.max(14, w * 0.035), 0, Math.PI * 2);
  ctx.fill();

  paintTiles(scroll.far, tileW, w, (x) => drawFarTile(ctx, x, world, tileW));
  paintTiles(scroll.mid, tileW, w, (x) => drawMidTile(ctx, x, world, tileW));
  paintTiles(scroll.near, tileW, w, (x) => drawNearTile(ctx, x, world, tileW));
  drawStreaks(ctx, world, scroll);
  drawRoof(ctx, world);
  drawSpeedPlate(ctx, world, scroll);
  ctx.restore();
}
