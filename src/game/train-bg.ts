import { getTrainSmoke, resetTrainSmoke, restoreTrainSmoke, type SmokeState } from "./train-smoke.ts";
import { resetTrainTunnel, getTrainTunnel, tunnelPassing, drawTunnel } from "./train-tunnel.ts";
import { drawTrainGantries, resetTrainGantries } from "./train-gantry.ts";
import type { World } from "./types";

/**
 * Traditional train roof, phases 1–2.
 * Owns the speed cycle, the three parallax offsets, and the analytic
 * acceleration the ball's inertia uses. The engine applies that force.
 * The ground is one train car in side view (fixed). The street
 * sky and clouds sit behind it. Far / mid / near are objects only — no band
 * fill — standing on the same horizon. Heights are fractions of the span from
 * the roof to the top of the frame: mountains about 1/2,
 * trees at most 1/3. Clouds sit behind the trees. They scroll backward at
 * different rates.
 *
 * Scenery moves left (backward) as `trainSpeed` rises. Offsets are cumulative
 * pixels; the renderer wraps each layer by its tile width so the loop is seamless
 * at any viewport size.
 */

export type TrainPhase = "parked" | "accel" | "cruise" | "decel";

export const TRAIN_ACCEL_SEC = 8;
export const TRAIN_DECEL_SEC = 8;
export const TRAIN_DWELL_SEC = 5;
export const TRAIN_INITIAL_TRAVEL_SEC = 60;
/** Each elapsed minute adds 12 seconds to the next journey. */
export const TRAIN_TRAVEL_GROWTH = 0.2;
export const TRAIN_SPEED_MAX = 540;
export const TRAIN_PARALLAX = { near: 1, mid: 0.45, far: 0.15 } as const;
export const TRAIN_INERTIA_K = 1.5;
export const TRAIN_PHASE_LABEL: Record<TrainPhase, string> = {
  parked: "停站", accel: "加速", cruise: "匀速", decel: "进站",
};

export type TrainScroll = {
  smoke?: SmokeState;
  tunnelBlocked?: boolean;
  tunnelRange?: { start: number; end: number };
  phase: TrainPhase;
  phaseT: number;
  trainSpeed: number;
  near: number;
  mid: number;
  far: number;
  started: boolean;
  /** Active game seconds since the first departure; includes station dwell. */
  elapsed: number;
  stationIndex: number;
  stationAt: number;
  nextStationAt: number;
  legSeconds: number;
  legDistance: number;
};

export function trainJourney(elapsed: number) {
  const age = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const seconds = TRAIN_INITIAL_TRAVEL_SEC + age * TRAIN_TRAVEL_GROWTH;
  // Integral of smoothstep speed: each ramp averages half the cruise speed.
  const distance = TRAIN_SPEED_MAX * (seconds - (TRAIN_ACCEL_SEC + TRAIN_DECEL_SEC) / 2);
  return { seconds, distance };
}

function initialState(): TrainScroll {
  const leg = trainJourney(0);
  return {
    phase: "parked", phaseT: 0, trainSpeed: 0, near: 0, mid: 0, far: 0,
    started: false, elapsed: 0, stationIndex: 0, stationAt: 0,
    nextStationAt: leg.distance, legSeconds: leg.seconds, legDistance: leg.distance,
  };
}
const state = initialState();
export function resetTrainScroll() { resetTrainSmoke(); Object.assign(state, initialState()); resetTrainGantries(); resetTrainTunnel(); }
export function getTrainScroll(): TrainScroll {
  const tunnel = getTrainTunnel();
  return { ...state, smoke: getTrainSmoke(), tunnelBlocked: tunnelPassing(),
    tunnelRange: tunnel.endAt > 0 ? { start: tunnel.startAt, end: tunnel.endAt } : undefined };
}

export function restoreTrainScroll(value: TrainScroll) { Object.assign(state, value); restoreTrainSmoke(value.smoke); }

function depart() {
  const leg = trainJourney(state.elapsed);
  state.legSeconds = leg.seconds;
  state.legDistance = leg.distance;
  state.stationAt = state.near;
  state.nextStationAt = state.stationAt + leg.distance;
  state.phase = "accel";
  state.phaseT = 0;
  state.trainSpeed = 0;
}
/** Only the first basket releases the initial station. Later dwell is automatic. */
export function startTrainScroll() {
  if (state.started) return;
  state.started = true;
  depart();
}
function clamp01(u: number) { return Math.max(0, Math.min(1, u)); }
export function trainSpeed01(speed = state.trainSpeed) { return clamp01(speed / TRAIN_SPEED_MAX); }
export function trainScrollShift(offset: number, tileW: number) {
  if (!(tileW > 0) || !Number.isFinite(offset)) return 0;
  return ((offset % tileW) + tileW) % tileW;
}
function phaseDuration(phase: TrainPhase) {
  if (phase === "parked") return TRAIN_DWELL_SEC;
  if (phase === "accel") return TRAIN_ACCEL_SEC;
  if (phase === "decel") return TRAIN_DECEL_SEC;
  return state.legSeconds - TRAIN_ACCEL_SEC - TRAIN_DECEL_SEC;
}
/** Smoothstep velocity gives a bell-shaped acceleration with zero at both ends. */
function smooth(u: number) { return u * u * (3 - 2 * u); }
function integral(u: number) { return u * u * u - 0.5 * u * u * u * u; }
export function trainAccel(phase: TrainPhase = state.phase, phaseT = state.phaseT): number {
  if (phase !== "accel" && phase !== "decel") return 0;
  const duration = phase === "accel" ? TRAIN_ACCEL_SEC : TRAIN_DECEL_SEC;
  const u = clamp01(phaseT / duration);
  return (phase === "accel" ? 1 : -1) * TRAIN_SPEED_MAX * 6 * u * (1 - u) / duration;
}
export function trainGravScale(ballGravity: number, baseBallGravity: number): number {
  if (!(baseBallGravity > 0) || !Number.isFinite(ballGravity)) return 1;
  return Math.max(0, ballGravity / baseBallGravity);
}
export function trainInertiaAccel(phase: TrainPhase = state.phase, k = TRAIN_INERTIA_K, gravScale = 1): number {
  const g = Number.isFinite(gravScale) ? Math.max(0, gravScale) : 1;
  const a = trainAccel(phase);
  return a === 0 ? 0 : -a * k * g;
}
function transition() {
  state.phaseT = 0;
  if (state.phase === "parked") { depart(); return; }
  if (state.phase === "accel") { state.phase = "cruise"; state.trainSpeed = TRAIN_SPEED_MAX; return; }
  if (state.phase === "cruise") { state.phase = "decel"; return; }
  state.phase = "parked";
  state.trainSpeed = 0;
  state.near = state.nextStationAt;
  state.mid = state.near * TRAIN_PARALLAX.mid;
  state.far = state.near * TRAIN_PARALLAX.far;
  state.stationAt = state.near;
  state.stationIndex += 1;
}
/** Exact integration preserves station alignment regardless of frame subdivision. */
export function stepTrainScroll(dt: number) {
  if (!state.started || !(dt > 0) || !Number.isFinite(dt)) return;
  let left = dt;
  while (left > 1e-8) {
    const duration = phaseDuration(state.phase);
    const slice = Math.min(left, Math.max(0, duration - state.phaseT));
    const u0 = clamp01(state.phaseT / duration);
    const u1 = clamp01((state.phaseT + slice) / duration);
    let distance = 0;
    if (state.phase === "accel" || state.phase === "decel") {
      const ramp = duration * (integral(u1) - integral(u0));
      distance = TRAIN_SPEED_MAX * (state.phase === "accel" ? ramp : slice - ramp);
      state.trainSpeed = TRAIN_SPEED_MAX * (state.phase === "accel" ? smooth(u1) : 1 - smooth(u1));
    } else if (state.phase === "cruise") {
      distance = TRAIN_SPEED_MAX * slice;
    }
    state.near += distance;
    state.mid = state.near * TRAIN_PARALLAX.mid;
    state.far = state.near * TRAIN_PARALLAX.far;
    state.phaseT += slice;
    state.elapsed += slice;
    left -= slice;
    if (state.phaseT >= duration - 1e-8) transition();
  }
}

/** World-relative station positions: departure behind, destination ahead. */
export function trainStationOffsets(scroll = state): number[] {
  const offsets = [scroll.stationAt - scroll.near];
  if (scroll.nextStationAt !== scroll.stationAt) offsets.push(scroll.nextStationAt - scroll.near);
  return offsets;
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

/** Heights as a fraction of the roof-to-top span. Mountains wander around 1/2. */
const MOUNTAIN_HEIGHT = [0.44, 0.53, 0.48, 0.57] as const;
const TREE_HEIGHT = [0.3, 1 / 3, 0.28, 0.32, 0.31] as const;


/** Wide massif. Blue-gray at the horizon, white at the peak. Not a thin cone. */
function drawMountain(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  height: number,
  bottomY: number,
) {
  const grad = ctx.createLinearGradient(cx, baseY - height, cx, baseY);
  grad.addColorStop(0, "#f7f8fa");
  grad.addColorStop(0.42, "#c5d0da");
  grad.addColorStop(1, "#6d8494");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - height);
  ctx.lineTo(cx - halfW, baseY);
  ctx.lineTo(cx - halfW, bottomY);
  ctx.lineTo(cx + halfW, bottomY);
  ctx.lineTo(cx + halfW, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawFarObjects(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  spanH: number,
  tileW: number,
  bottomY: number,
) {
  const peaks = [
    { fx: 0.28, h: MOUNTAIN_HEIGHT[0], w: 0.4 },
    { fx: 0.74, h: MOUNTAIN_HEIGHT[1], w: 0.36 },
  ] as const;
  for (const p of peaks) {
    drawMountain(ctx, x + tileW * p.fx, floorY, tileW * p.w, spanH * p.h, bottomY);
  }
}

function drawMidObjects(
  ctx: CanvasRenderingContext2D,
  x: number,
  floorY: number,
  spanH: number,
  tileW: number,
  bottomY: number,
) {
  const n = 10;
  const step = tileW / n;
  const halfW = step * 0.64;
  for (let i = 0; i <= n; i++) {
    const th = spanH * TREE_HEIGHT[i % TREE_HEIGHT.length]!;
    const tx = x + i * step;
    ctx.fillStyle = i % 2 === 0 ? "#3d6248" : "#2f5a3c";
    ctx.beginPath();
    ctx.moveTo(tx, floorY - th);
    ctx.lineTo(tx + halfW, floorY);
    ctx.lineTo(tx + halfW, bottomY);
    ctx.lineTo(tx - halfW, bottomY);
    ctx.lineTo(tx - halfW, floorY);
    ctx.closePath();
    ctx.fill();
    // Lower forest detail remains behind the carriage and visible through gaps.
    ctx.fillStyle = "#394836";
    ctx.fillRect(tx - step * 0.055, floorY + 3, step * 0.11, bottomY - floorY);
  }
}

/** Reserved near-parallax layer: retained for future scenery, currently empty. */
function drawNearObjects(
  _ctx: CanvasRenderingContext2D, _x: number, _floorY: number, _spanH: number,
  _tileW: number, _u: number, _bottomY: number,
) {}

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
/** Steam-era teak coach: one cached transparent texture, independent of motion. */
let coachTexture: HTMLCanvasElement | null = null;
function getCoachTexture() {
  if (coachTexture) return coachTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 1000; canvas.height = 420;
  const c = canvas.getContext("2d")!;
  const wood = c.createLinearGradient(0, 50, 0, 420);
  wood.addColorStop(0, "#70422b"); wood.addColorStop(0.5, "#a56b3c"); wood.addColorStop(1, "#492c22");
  c.fillStyle = wood; c.fillRect(70, 46, 930, 360);
  // Raised wooden framing and grain, not a modern painted window band.
  for (let x = 76; x < 1000; x += 22) {
    c.fillStyle = "rgba(36,17,11,.28)"; c.fillRect(x, 54, 2, 342);
    c.fillStyle = "rgba(235,177,101,.13)"; c.fillRect(x + 5, 60, 1, 330);
  }
  c.fillStyle = "#302c29"; c.fillRect(0, 0, 1000, 48);
  c.fillStyle = "#54534b"; c.fillRect(0, 2, 1000, 8);
  c.fillStyle = "#151e20"; c.fillRect(0, 43, 1000, 8);
  for (let x = 100; x < 1000; x += 102) {
    c.fillStyle = "#74736a"; c.fillRect(x, 10, 3, 31);
    c.fillStyle = "#1e2527"; c.fillRect(x + 24, 18, 38, 13);
    c.fillStyle = "#66685f"; c.fillRect(x + 22, 15, 42, 4);
  }
  // Open end balcony: wrought iron uprights, brass handrails and steps.
  c.fillStyle = "#1d2829"; c.fillRect(0, 392, 78, 15);
  for (const x of [8, 36, 64]) { c.fillRect(x, 72, 5, 322); }
  c.fillStyle = "#b9a16a"; c.fillRect(6, 106, 66, 5); c.fillRect(6, 274, 66, 5);
  c.fillStyle = "#52605b"; c.fillRect(6, 355, 60, 7); c.fillRect(0, 380, 74, 7);
  // Paneled entrance door with a high arched glazed opening.
  c.fillStyle = "#3b2b23"; c.fillRect(80, 55, 84, 337);
  c.strokeStyle = "#b18a50"; c.lineWidth = 3; c.strokeRect(86, 61, 72, 325);
  c.fillStyle = "#243c3e"; c.beginPath(); c.roundRect(96, 78, 52, 139, [24,24,2,2]); c.fill();
  c.fillStyle = "#a4b8ac"; c.fillRect(102, 91, 5, 110);
  c.strokeStyle = "#986538"; c.strokeRect(96, 240, 52, 116);
  c.fillStyle = "#dfbd71"; c.fillRect(142, 224, 6, 25);
  for (let x = 190; x < 1000; x += 136) {
    // Arched brass frames, split panes and warm curtains.
    c.fillStyle = "#332b22"; c.beginPath(); c.roundRect(x - 8, 68, 116, 191, [30,30,3,3]); c.fill();
    c.fillStyle = "#c4a364"; c.beginPath(); c.roundRect(x - 3, 73, 106, 181, [26,26,2,2]); c.fill();
    const glass = c.createLinearGradient(0, 78, 0, 249);
    glass.addColorStop(0, "#1e353b"); glass.addColorStop(1, "#82968b");
    c.fillStyle = glass; c.beginPath(); c.roundRect(x + 3, 79, 94, 169, [23,23,1,1]); c.fill();
    c.fillStyle = "#775342"; c.fillRect(x + 5, 110, 12, 136); c.fillRect(x + 83, 110, 12, 136);
    c.fillStyle = "#e2c58d"; c.fillRect(x + 46, 80, 4, 168); c.fillRect(x + 3, 130, 94, 4);
    c.fillStyle = "rgba(223,235,213,.25)"; c.fillRect(x + 23, 139, 5, 97);
    c.fillStyle = "#573824"; c.fillRect(x - 8, 275, 116, 100);
    c.strokeStyle = "#bc9459"; c.lineWidth = 2; c.strokeRect(x - 2, 281, 104, 88);
    c.strokeStyle = "#805331"; c.strokeRect(x + 4, 287, 92, 76);
  }
  // Fine gold lining, coach crest and traditional lettering.
  c.fillStyle = "#c6a567"; c.fillRect(74, 59, 926, 3); c.fillRect(74, 264, 926, 4); c.fillRect(74, 390, 926, 3);
  c.fillStyle = "#292f2a"; c.fillRect(290, 301, 508, 49);
  c.strokeStyle = "#b8995f"; c.lineWidth = 2; c.strokeRect(294, 305, 500, 41);
  c.fillStyle = "#e5cf96"; c.font = "bold 23px Georgia, serif"; c.textAlign = "center";
  c.fillText("S T E A M   R A I L W A Y", 544, 334);
  c.font = "18px Georgia, serif"; c.fillText("No. 07", 231, 336);
  c.fillStyle = "#182224"; c.fillRect(0, 405, 1000, 15);
  coachTexture = canvas;
  return canvas;
}
function drawTrainCar(ctx: CanvasRenderingContext2D, world: World, scroll: TrainScroll) {
  const { w, h, floorY } = world;
  const u = w / 390;
  const depth = Math.max(8, h - floorY);
  const wheelR = Math.max(7, Math.min(15 * u, depth * 0.16));
  const bodyBot = h - wheelR * 1.15;
  ctx.drawImage(getCoachTexture(), 0, floorY, w, Math.max(1, bodyBot - floorY));
  const wy = Math.min(h - wheelR - 1, bodyBot + wheelR * 0.15);
  for (const center of [w * 0.23, w * 0.81]) {
    ctx.fillStyle = "#25302e";
    ctx.fillRect(center - 30 * u, wy - 7 * u, 60 * u, 8 * u);
    for (const x of [center - 18 * u, center + 18 * u]) {
      drawWheel(ctx, x, wy, wheelR);
      ctx.save(); ctx.translate(x, wy); ctx.rotate(scroll.near / wheelR);
      ctx.strokeStyle = "#69766e"; ctx.lineWidth = 1.5 * u;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(wheelR * 0.3, 0); ctx.lineTo(wheelR * 0.85, 0); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Small brass route plate; no LED display on a steam-era carriage.
  const px = w - 112 * u, py = floorY + 4 * u;
  ctx.fillStyle = "#242c27"; ctx.fillRect(px, py, 104 * u, 14 * u);
  ctx.strokeStyle = "#ab9059"; ctx.lineWidth = u; ctx.strokeRect(px, py, 104 * u, 14 * u);
  ctx.fillStyle = "#e7d6a5"; ctx.font = `600 ${10 * u}px serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const label = scroll.phase === "parked" && scroll.started
    ? "停站 " + Math.max(0, Math.ceil(TRAIN_DWELL_SEC - scroll.phaseT)) + "s"
    : TRAIN_PHASE_LABEL[scroll.phase];
  ctx.fillText(label + " · " + (scroll.stationIndex + 1) + "站", px + 52 * u, py + 7 * u);
}

/**
 * Scenery over the street sky. `clouds` paints the shared cloud sprites:
 * behind the mountains, then again in front of them. Both passes stay under
 * the trees. Each object continues below the roof behind the carriage,
 * including its open balcony and the gaps around its wheels. Near remains reserved.
 */
export function drawTrainBackdrop(
  ctx: CanvasRenderingContext2D,
  world: World,
  clouds?: ((which: "back" | "front") => void) | null,
) {
  const { w, h, floorY } = world;
  const scroll = getTrainScroll();
  const tileW = Math.max(1, w);
  const u = w / 390;
  const spanH = Math.max(1, floorY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  clouds?.("back");
  paintTiles(scroll.far, tileW, w, (x) => drawFarObjects(ctx, x, floorY, spanH, tileW, h));
  clouds?.("front");
  paintTiles(scroll.mid, tileW, w, (x) => drawMidObjects(ctx, x, floorY, spanH, tileW, h));
  paintTiles(scroll.near, tileW, w, (x) => drawNearObjects(ctx, x, floorY, spanH, tileW, u, h));
  ctx.restore();
  drawTunnel(ctx, world);
  drawStation(ctx, world, scroll);
  drawTrainCar(ctx, world, scroll);
  drawTrainGantries(ctx, world, scroll);
}

/** Transparent station texture reused at actual route coordinates. */
const STATION_NAMES = ["雾松站", "白桦站", "钟楼站", "灰石站", "鹿谷站", "银溪站", "风铃站", "橡木站", "石桥站", "暮湖站", "雪岭站", "枫谷站", "晨露站", "松鹿站", "月湾站", "星桥站"];
/** Route index keeps arrival, departure and time rewind on the same station name. */
export function trainStationName(index: number) {
  return STATION_NAMES[((Math.floor(index) % STATION_NAMES.length) + STATION_NAMES.length) % STATION_NAMES.length];
}
let stationTexture: HTMLCanvasElement | null = null;
function getStationTexture() {
  if (stationTexture) return stationTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 1000; canvas.height = 420;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#b8a184"; c.fillRect(50, 114, 900, 290);
  c.fillStyle = "#d6c3a0"; c.fillRect(68, 126, 864, 260);
  c.strokeStyle = "#bba789"; c.lineWidth = 2;
  for (let y = 142; y < 385; y += 22) {
    c.beginPath(); c.moveTo(68, y); c.lineTo(932, y); c.stroke();
    for (let x = 68 + (y % 44 ? 24 : 0); x < 932; x += 48) {
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 22); c.stroke();
    }
  }
  c.fillStyle = "#714b3d";
  c.beginPath(); c.moveTo(28, 120); c.lineTo(104, 58); c.lineTo(896, 58); c.lineTo(972, 120); c.closePath(); c.fill();
  c.strokeStyle = "#9b6c50";
  for (let x = 100; x < 920; x += 24) { c.beginPath(); c.moveTo(x, 63); c.lineTo(x - 25, 112); c.stroke(); }
  for (const x of [104, 238, 642, 776]) {
    c.fillStyle = "#80765f"; c.fillRect(x - 7, 206, 100, 144);
    c.fillStyle = "#334c4b"; c.fillRect(x, 214, 86, 128);
    c.fillStyle = "#8ea7a0"; c.fillRect(x + 5, 219, 33, 53);
    c.fillStyle = "#b7af8a"; c.fillRect(x + 40, 214, 5, 128); c.fillRect(x, 275, 86, 5);
  }
  c.fillStyle = "#47594c"; c.fillRect(378, 215, 244, 175);
  c.fillStyle = "#223d38"; c.fillRect(393, 228, 99, 155); c.fillRect(508, 228, 99, 155);
  c.fillStyle = "#e7d7a8"; c.fillRect(352, 133, 296, 61);
  c.strokeStyle = "#526152"; c.lineWidth = 4; c.strokeRect(352, 133, 296, 61);
  c.fillStyle = "#eee5c8"; c.beginPath(); c.arc(500, 78, 24, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(500, 60); c.lineTo(500, 78); c.lineTo(514, 85); c.stroke();
  c.fillStyle = "#52675e"; c.fillRect(0, 198, 1000, 14);
  c.fillStyle = "#839286"; c.fillRect(0, 193, 1000, 5);
  for (const x of [24, 334, 666, 976]) {
    c.fillStyle = "#46584f"; c.fillRect(x, 212, 9, 186);
    c.strokeStyle = "#46584f"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(x - 27, 212); c.lineTo(x + 4, 243); c.lineTo(x + 35, 212); c.stroke();
  }
  c.fillStyle = "#8d8979"; c.fillRect(0, 389, 1000, 31);
  c.fillStyle = "#dac17c"; c.fillRect(0, 389, 1000, 6);
  stationTexture = canvas;
  return canvas;
}
function drawStation(ctx: CanvasRenderingContext2D, world: World, scroll: TrainScroll) {
  const width = world.w * 2.2;
  const height = width * 0.42;
  // Platform stands beside the carriage, not on its roof. Drawing the train
  // afterwards occludes the station's lower walls, doors and platform edge.
  const wheelR = Math.max(7, Math.min(15 * world.w / 390, (world.h - world.floorY) * 0.16));
  const platformY = world.h - wheelR * 1.15;
  for (const [ahead, offset] of trainStationOffsets(scroll).entries()) {
    const x = (world.w - width) / 2 + offset;
    if (x + width <= 0 || x >= world.w) continue;
    ctx.drawImage(getStationTexture(), x, platformY - height, width, height);
    ctx.save();
    ctx.translate(x, platformY - height); ctx.scale(width / 1000, height / 420);
    ctx.fillStyle = "#354f45"; ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(trainStationName(scroll.stationIndex + ahead), 500, 173);
    ctx.restore();
  }
}
