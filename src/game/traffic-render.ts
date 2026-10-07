import type { Ball, World } from "./types";
import type { TrafficTextures } from "./scenes";
import { nightAmount } from "./daylight";
import { TRAFFIC_ABSORB_SECONDS, TRAFFIC_BURN_CHAR, TRAFFIC_BURN_SECONDS, bridgeY, vehicleBounds, type TrafficState, type Vehicle } from "./traffic";

const textures = new Map<string, HTMLImageElement>();
function texture(src: string | null | undefined) {
  if (!src) return null;
  let img = textures.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.src = src;
    textures.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const PAINT = ["#cd6744", "#577f86", "#d4ad65"];
/** Container side in right-facing sprite UV coordinates; kept clear for future artwork. */
export const CONTAINER_GRAFFITI_PANEL = { x: 0.075, y: 0.16, w: 0.56, h: 0.49 };
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function drawShadow(ctx: CanvasRenderingContext2D, v: Vehicle, world: World) {
  const { w, h, bottom } = vehicleBounds(v, world);
  ctx.fillStyle = "rgba(13,22,29,0.22)";
  ctx.beginPath(); ctx.ellipse(v.x, bottom + 1, w * 0.48, h * 0.055, 0, 0, Math.PI * 2); ctx.fill();
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, art: TrafficTextures) {
  const { w, h, bottom } = vehicleBounds(v, world);
  ctx.save();
  ctx.translate(v.x, bottom);
  ctx.scale(v.dir, 1);
  const img = texture(art[v.kind]);
  if (img) { ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore(); return; }
  ctx.translate(-w / 2, -h);
  ctx.fillStyle = v.kind === "taxi" ? "#cbb55e" : PAINT[v.tint % PAINT.length]!;
  if (v.kind === "semi") {
    ctx.fillStyle = "#899a9a";
    round(ctx, w * 0.02, h * 0.03, w * 0.67, h * 0.78, h * 0.02);
    ctx.fillStyle = "#617778";
    for (let i = 0; i < 16; i++) ctx.fillRect(w * (0.035 + i * 0.041), h * 0.06, w * 0.007, h * 0.71);
    const panel = CONTAINER_GRAFFITI_PANEL;
    ctx.fillStyle = "#a7b2ad";
    ctx.fillRect(w * panel.x, h * panel.y, w * panel.w, h * panel.h);
    ctx.strokeStyle = "rgba(39,58,61,0.35)"; ctx.lineWidth = Math.max(0.5, w / 390);
    ctx.strokeRect(w * panel.x, h * panel.y, w * panel.w, h * panel.h);
    const decal = texture(art.containerGraffiti);
    if (decal) {
      ctx.save();
      ctx.beginPath(); ctx.rect(w * panel.x, h * panel.y, w * panel.w, h * panel.h); ctx.clip();
      if (v.dir < 0) { ctx.translate(w * (panel.x * 2 + panel.w), 0); ctx.scale(-1, 1); }
      ctx.drawImage(decal, w * panel.x, h * panel.y, w * panel.w, h * panel.h);
      ctx.restore();
    }
    ctx.fillStyle = "#32474e";
    ctx.fillRect(w * 0.04, h * 0.78, w * 0.89, h * 0.09);
    ctx.fillStyle = PAINT[v.tint % PAINT.length]!;
    round(ctx, w * 0.74, h * 0.25, w * 0.24, h * 0.6, h * 0.055);
    ctx.fillStyle = "#273e4a";
    round(ctx, w * 0.78, h * 0.32, w * 0.17, h * 0.26, h * 0.025);
    ctx.fillStyle = "#a7c5c6"; ctx.fillRect(w * 0.8, h * 0.35, w * 0.12, h * 0.025);
  } else if (v.kind === "bus" || v.kind === "van") {
    const bus = v.kind === "bus";
    ctx.fillStyle = bus ? "#b5b8a4" : "#b9c2bf";
    round(ctx, w * 0.03, h * 0.04, w * 0.94, h * 0.79, h * 0.08);
    ctx.fillStyle = bus ? "#527c7a" : "#647986";
    ctx.fillRect(w * 0.03, h * 0.58, w * 0.94, h * 0.17);
    ctx.fillStyle = "#273e4a";
    const panes = bus ? 7 : 3;
    for (let i = 0; i < panes; i++) {
      const x = w * (0.08 + i * 0.84 / panes);
      round(ctx, x, h * 0.15, w * 0.72 / panes, h * 0.3, h * 0.018);
      ctx.fillStyle = "rgba(188,215,216,0.28)";
      ctx.fillRect(x + w * 0.012, h * 0.17, w * 0.5 / panes, h * 0.03);
      ctx.fillStyle = "#273e4a";
    }
    ctx.strokeStyle = "rgba(31,50,58,0.45)"; ctx.lineWidth = w * 0.006;
    ctx.strokeRect(w * 0.75, h * 0.12, w * 0.14, h * 0.66);
  } else if (v.kind === "truck") {
    ctx.fillStyle = "#d0c9b7";
    round(ctx, w * 0.02, 0, w * 0.64, h * 0.82, h * 0.025);
    ctx.fillStyle = "#aea997";
    for (let n = 0; n < 7; n++) ctx.fillRect(w * (0.065 + n * 0.08), h * 0.07, w * 0.012, h * 0.68);
    ctx.fillStyle = "#506b70";
    ctx.fillRect(w * 0.05, h * 0.51, w * 0.58, h * 0.16);
    ctx.fillStyle = PAINT[v.tint % PAINT.length]!;
    round(ctx, w * 0.66, h * 0.28, w * 0.32, h * 0.57, h * 0.045);
    ctx.fillStyle = "#263e48";
    round(ctx, w * 0.71, h * 0.34, w * 0.23, h * 0.25, h * 0.025);
    ctx.fillStyle = "#b6d1d0";
    ctx.fillRect(w * 0.74, h * 0.37, w * 0.16, h * 0.025);
  } else {
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.56);
    ctx.lineTo(w * 0.28, h * 0.02);
    ctx.lineTo(w * 0.65, h * 0.02);
    ctx.lineTo(w * 0.81, h * 0.51);
    ctx.closePath(); ctx.fill();
    round(ctx, w * 0.02, h * 0.48, w * 0.96, h * 0.38, h * 0.09);
    ctx.fillStyle = "#263e48";
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.46); ctx.lineTo(w * 0.31, h * 0.09);
    ctx.lineTo(w * 0.62, h * 0.09); ctx.lineTo(w * 0.74, h * 0.46);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#accacb";
    ctx.fillRect(w * 0.33, h * 0.13, w * 0.24, h * 0.035);
    ctx.fillStyle = PAINT[v.tint % PAINT.length]!;
    ctx.fillRect(w * 0.47, h * 0.07, w * 0.035, h * 0.43);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(w * 0.1, h * 0.56, w * 0.78, h * 0.035);
    ctx.fillStyle = "#293c43";
    ctx.fillRect(w * 0.4, h * 0.61, w * 0.065, h * 0.03);
    if (v.kind === "suv") {
      ctx.fillRect(w * 0.29, 0, w * 0.35, h * 0.035);
      ctx.fillRect(w * 0.07, h * 0.76, w * 0.86, h * 0.06);
    }
    if (v.kind === "taxi") {
      ctx.fillStyle = "#ddd0a1"; round(ctx, w * 0.4, -h * 0.025, w * 0.16, h * 0.1, h * 0.025);
      ctx.fillStyle = "#37434a";
      for (let i = 0; i < 8; i++) ctx.fillRect(w * (0.3 + i * 0.055), h * (0.65 + (i % 2) * 0.035), w * 0.035, h * 0.035);
    }
  }
  ctx.fillStyle = "#f8dfa4";
  ctx.fillRect(w * 0.92, h * 0.62, w * 0.065, h * 0.12);
  ctx.fillStyle = "#a53632";
  ctx.fillRect(w * 0.02, h * 0.63, w * 0.045, h * 0.1);
  ctx.fillStyle = "#26333a";
  ctx.fillRect(w * 0.02, h * 0.81, w * 0.96, h * 0.055);
  const radius = h * (["truck", "semi", "bus", "van"].includes(v.kind) ? 0.13 : 0.19);
  const wheels = v.kind === "semi" ? [0.13, 0.23, 0.63, 0.71, 0.88] : v.kind === "truck" ? [0.16, 0.34, 0.83] : [0.23, 0.77];
  for (const u of wheels) {
    ctx.save(); ctx.translate(w * u, h - radius); ctx.rotate(v.x * v.dir / radius);
    ctx.fillStyle = "#1f292e";
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a6b1b0";
    ctx.beginPath(); ctx.arc(0, 0, radius * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#56656c";
    ctx.fillRect(-radius * 0.42, -radius * 0.1, radius * 0.84, radius * 0.2);
    ctx.restore();
  }
  ctx.restore();
}

const LAYER_SCALE = 2;
let layer: HTMLCanvasElement | null = null;

/** Renders the car alone so tints only touch its own pixels (source-atop). */
function vehicleLayer(v: Vehicle, world: World, art: TrafficTextures) {
  const b = vehicleBounds(v, world);
  layer ??= document.createElement("canvas");
  const cw = Math.ceil(b.w * LAYER_SCALE), ch = Math.ceil(b.h * LAYER_SCALE);
  if (layer.width < cw) layer.width = cw;
  if (layer.height < ch) layer.height = ch;
  const c = layer.getContext("2d")!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.clearRect(0, 0, layer.width, layer.height);
  c.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, -b.x * LAYER_SCALE, -b.y * LAYER_SCALE);
  drawVehicle(c, v, world, art);
  c.globalCompositeOperation = "source-atop";
  return { c, canvas: layer, b, cw, ch };
}

function drawFrozen(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, art: TrafficTextures) {
  const { c, canvas, b, cw, ch } = vehicleLayer(v, world, art);
  c.fillStyle = "rgba(150,214,255,0.42)";
  c.fillRect(b.x, b.y, b.w, b.h);
  c.fillStyle = "rgba(255,255,255,0.7)";
  for (const [u, width] of [[0.18, 0.07], [0.32, 0.03], [0.6, 0.06], [0.74, 0.025]] as const) {
    const x = b.x + b.w * u;
    c.beginPath();
    c.moveTo(x, b.y + b.h); c.lineTo(x + b.w * width, b.y + b.h);
    c.lineTo(x + b.w * width + b.h * 0.7, b.y); c.lineTo(x + b.h * 0.7, b.y);
    c.closePath(); c.fill();
  }
  ctx.drawImage(canvas, 0, 0, cw, ch, b.x, b.y, b.w, b.h);
}

const SHARD_COLS = 6, SHARD_ROWS = 3;
function shardRand(id: number, i: number, k: number) {
  const s = Math.sin(id * 127.1 + i * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Chars to black, then breaks into falling, spinning fragments of the same sprite. */
function drawBurnt(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, art: TrafficTextures) {
  const t = v.burnt ?? 0;
  const bounds = vehicleBounds(v, world);
  const launch = v.burnLaunch;
  ctx.save();
  if (launch) {
    const cx = v.x, cy = bounds.y + bounds.h / 2;
    ctx.translate(cx + launch.vx * t, cy + launch.vy * t + 450 * t * t);
    ctx.rotate((launch.spin ?? v.dir * 2.4) * Math.min(t, TRAFFIC_BURN_CHAR));
    ctx.translate(-cx, -cy);
  }
  drawBurntFragments(ctx, v, world, art, t);
  ctx.restore();
}

function drawBurntFragments(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, art: TrafficTextures, t: number) {
  const { c, canvas, b, cw, ch } = vehicleLayer(v, world, art);
  c.fillStyle = `rgba(18,14,12,${Math.min(1, 0.35 + (t / TRAFFIC_BURN_CHAR) * 0.65)})`;
  c.fillRect(b.x, b.y, b.w, b.h);
  if (t < TRAFFIC_BURN_CHAR) {
    ctx.drawImage(canvas, 0, 0, cw, ch, b.x, b.y, b.w, b.h);
    return;
  }
  const p = (t - TRAFFIC_BURN_CHAR) / (TRAFFIC_BURN_SECONDS - TRAFFIC_BURN_CHAR);
  const sw = b.w / SHARD_COLS, sh = b.h / SHARD_ROWS, unit = world.w / 390;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p * p);
  for (let row = 0; row < SHARD_ROWS; row++) for (let col = 0; col < SHARD_COLS; col++) {
    const i = row * SHARD_COLS + col;
    const cx = b.x + (col + 0.5) * sw, cy = b.y + (row + 0.5) * sh;
    const out = (col + 0.5) / SHARD_COLS - 0.5;
    // The parent transform carries the original ballistic path and gravity.
    // Fragments only gain a small local spread, never a second upward launch.
    const vx = (out * 65 + (shardRand(v.id, i, 0) - 0.5) * 28) * unit;
    const vy = ((row + 0.5) / SHARD_ROWS - 0.5) * 45 * unit;
    const s = p * (TRAFFIC_BURN_SECONDS - TRAFFIC_BURN_CHAR);
    ctx.save();
    const spread = s * s / (TRAFFIC_BURN_SECONDS - TRAFFIC_BURN_CHAR);
    ctx.translate(cx + vx * spread, cy + vy * spread);
    ctx.rotate(((v.burnLaunch?.spin ?? 0) + (shardRand(v.id, i, 2) - 0.5) * 12) * s);
    // Shared jittered corners preserve the silhouette but break the regular grid.
    const corner = (x: number, y: number) => ({
      x: b.x + (x + (x > 0 && x < SHARD_COLS ? (shardRand(v.id, y * 7 + x, 4) - 0.5) * 0.8 : 0)) * sw - cx,
      y: b.y + (y + (y > 0 && y < SHARD_ROWS ? (shardRand(v.id, y * 7 + x, 5) - 0.5) * 0.8 : 0)) * sh - cy,
    });
    const points = [corner(col, row), corner(col + 1, row), corner(col + 1, row + 1), corner(col, row + 1)];
    ctx.beginPath();
    points.forEach((q, j) => j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.closePath(); ctx.clip();
    ctx.drawImage(canvas, 0, 0, cw, ch, b.x - cx, b.y - cy, b.w, b.h);
    ctx.restore();
  }
  ctx.restore();
}

function drawVehicleFire(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, clock: number) {
  const b = vehicleBounds(v, world), unit = world.w / 390;
  ctx.save();
  const age = Math.max(0, clock - (v.ignitedAt ?? clock - 1));
  const growth = Math.min(1, 0.2 + age * 2.5);
  for (let i = 0; i < 10; i++) {
    const phase = (age * 0.7 + shardRand(v.id, i, 7)) % 1;
    const x = b.x + b.w * shardRand(v.id, i, 8) - v.dir * phase * 24 * unit;
    const y = b.y - phase * 48 * unit;
    ctx.fillStyle = `rgba(48,42,39,${0.16 * (1 - phase) * growth})`;
    ctx.beginPath(); ctx.ellipse(x, y, (5 + phase * 12) * unit, (7 + phase * 10) * unit, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 11; i++) {
    const seed = shardRand(v.id, i, 3), u = 0.06 + i * 0.085;
    const x = b.x + b.w * u, facingU = v.dir > 0 ? u : 1 - u;
    const roof = v.kind === "truck" ? (facingU < 0.66 ? 0.05 : 0.32) : (facingU > 0.22 && facingU < 0.77 ? 0.08 : 0.52);
    const y = b.y + b.h * roof;
    const sway = (Math.sin(clock * (7 + seed * 4) + i * 2.3) * 4 - v.dir * 5) * unit;
    const h = (17 + seed * 18 + Math.sin(clock * 13 + i * 1.7) * 6) * unit * growth;
    const glow = ctx.createLinearGradient(x, y + 6 * unit, x, y - h);
    glow.addColorStop(0, "rgba(255,224,124,0.95)");
    glow.addColorStop(0.4, "rgba(255,130,25,0.88)");
    glow.addColorStop(1, "rgba(223,58,20,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.moveTo(x - 7 * unit, y + 6 * unit);
    ctx.quadraticCurveTo(x - 10 * unit, y - h * 0.35, x + sway, y - h);
    ctx.quadraticCurveTo(x + 11 * unit, y - h * 0.2, x + 7 * unit, y + 6 * unit);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,216,105,0.95)";
    ctx.beginPath(); ctx.moveTo(x - 3 * unit, y + 5 * unit); ctx.quadraticCurveTo(x - 2 * unit, y - h * 0.25, x + sway * 0.4, y - h * 0.55); ctx.quadraticCurveTo(x + 2 * unit, y - h * 0.1, x + 4 * unit, y + 5 * unit); ctx.fill();
    const ember = (age * (0.9 + seed) + seed) % 1;
    ctx.fillStyle = `rgba(255,181,64,${(1 - ember) * growth})`;
    ctx.fillRect(x + sway * ember, y - h - ember * 22 * unit, 1.5 * unit, 2 * unit);
  }
  ctx.restore();
}

function drawAbsorbed(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, art: TrafficTextures) {
  const a = v.absorbed;
  if (!a) return;
  const p = Math.min(1, Math.max(0, a.elapsed / TRAFFIC_ABSORB_SECONDS));
  // Start moving immediately; a hold plus zero-slope easing made capture look stalled.
  const ease = p * (0.65 + 0.35 * p);
  const { canvas, b, cw, ch } = vehicleLayer(v, world, art);
  const startY = b.y + b.h / 2 + a.y;
  const x = a.x + (a.targetX - a.x) * ease, y = startY + (a.targetY - startY) * ease;
  const scale = Math.max(0, 1 - ease * ease);
  ctx.save(); ctx.translate(x, y);
  // Right-facing and left-facing sprites need different heading offsets.
  const heading = Math.atan2(a.targetY - startY, a.targetX - a.x) - (v.dir < 0 ? Math.PI : 0);
  const turn = Math.atan2(Math.sin(heading), Math.cos(heading));
  ctx.rotate(turn * Math.min(1, p * 5));
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1 - Math.pow(ease, 4);
  ctx.drawImage(canvas, 0, 0, cw, ch, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

/** Entire bridge is background art: no colliders, including its supports. */
export function drawTrafficWorld(ctx: CanvasRenderingContext2D, state: TrafficState, world: World, art: TrafficTextures, time = state.clock) {
  const y = bridgeY(world), unit = world.w / 390, depth = 29 * unit;
  ctx.save();
  ctx.fillStyle = "rgba(26,39,43,0.2)";
  ctx.fillRect(0, y + depth, world.w, 11 * unit);
  for (const u of [0.18, 0.82]) {
    const x = world.w * u;
    ctx.fillStyle = "#838f8c";
    ctx.fillRect(x - 9 * unit, y + depth, 18 * unit, world.floorY - y - depth);
    ctx.fillStyle = "#a8af9e";
    ctx.fillRect(x - 9 * unit, y + depth, 5 * unit, world.floorY - y - depth);
    ctx.fillStyle = "#5e716e";
    ctx.fillRect(x - 18 * unit, y + depth - 2, 36 * unit, 11 * unit);
  }
  const img = texture(art.bridge);
  if (img) ctx.drawImage(img, 0, y, world.w, depth);
  else {
    ctx.fillStyle = "#3c4c51"; ctx.fillRect(0, y, world.w, depth);
    ctx.fillStyle = "#b8bba7"; ctx.fillRect(0, y + 4 * unit, world.w, 15 * unit);
    ctx.fillStyle = "#e3d8b6"; ctx.fillRect(0, y, world.w, 3 * unit);
    ctx.fillStyle = "#748782"; ctx.fillRect(0, y + 20 * unit, world.w, 3 * unit);
    ctx.fillStyle = "#6a7974";
    for (let x = 16 * unit; x < world.w; x += 39 * unit) ctx.fillRect(x, y + 7 * unit, 3 * unit, 9 * unit);
  }
  const night = nightAmount(time);
  ctx.fillStyle = `rgba(12,24,47,${night * 0.4})`;
  ctx.fillRect(0, y, world.w, depth);
  for (const v of state.vehicles) {
    if (v.absorbed) { drawAbsorbed(ctx, v, world, art); continue; }
    if (v.burnt !== undefined) {
      drawBurnt(ctx, v, world, art);
      continue;
    }
    drawShadow(ctx, v, world);
    if (night > 0.01) drawVehicleLights(ctx, v, world, night);
    if ((v.frozenLeft ?? 0) > 0) drawFrozen(ctx, v, world, art);
    else drawVehicle(ctx, v, world, art);
    if (v.burning) drawVehicleFire(ctx, v, world, state.clock);
  }
  ctx.restore();
}

function drawVehicleLights(ctx: CanvasRenderingContext2D, v: Vehicle, world: World, night: number) {
  const b = vehicleBounds(v, world), unit = world.w / 390;
  const x = v.x + v.dir * b.w * 0.47, y = b.y + b.h * 0.69;
  ctx.save(); ctx.translate(x, y); ctx.scale(v.dir, 1);
  const beam = ctx.createLinearGradient(0, 0, 48 * unit, 0);
  beam.addColorStop(0, `rgba(240,220,160,${night * 0.16})`);
  beam.addColorStop(1, "rgba(240,220,160,0)");
  ctx.fillStyle = beam;
  ctx.beginPath(); ctx.moveTo(0, -2 * unit); ctx.lineTo(48 * unit, -7 * unit);
  ctx.lineTo(48 * unit, 14 * unit); ctx.lineTo(0, 3 * unit); ctx.fill();
  ctx.fillStyle = `rgba(255,230,166,${night * 0.75})`;
  ctx.beginPath(); ctx.ellipse(0, 0, 4 * unit, 3 * unit, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(210,69,45,${night * 0.55})`;
  ctx.beginPath(); ctx.ellipse(-b.w * 0.92, 0, 3 * unit, 2.5 * unit, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Foreground warnings stay readable even when a basket stands near an entrance. */
export function drawTrafficAlerts(ctx: CanvasRenderingContext2D, state: TrafficState, world: World, _ball: Ball) {
  const unit = world.w / 390;
  ctx.save();
  ctx.font = `bold ${11 * unit}px sans-serif`;
  ctx.textAlign = "center";
  for (const warning of state.warnings) {
    const x = warning.dir > 0 ? 23 * unit : world.w - 23 * unit;
    const y = (warning.lane === "ground" ? world.floorY : bridgeY(world)) - 64 * unit;
    const bright = Math.floor(state.clock * 5) % 2 === 0;
    ctx.globalAlpha = bright ? 1 : 0.38;
    ctx.fillStyle = "#f3bd54";
    ctx.beginPath(); ctx.moveTo(x, y - 23 * unit); ctx.lineTo(x + 15 * unit, y + 3 * unit); ctx.lineTo(x - 15 * unit, y + 3 * unit); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#25343b";
    ctx.font = `bold ${20 * unit}px sans-serif`; ctx.fillText("!", x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
