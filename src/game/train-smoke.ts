import type { World } from "./types";

export type SmokePuff = { x: number; y: number; age: number; black: boolean; shade?: number; strength?: number; seed: number };
export type SmokeState = { clock: number; emission: number; puffs: SmokePuff[] };
export const createTrainSmoke = (): SmokeState => ({ clock: 0, emission: 0, puffs: [] });
let state = createTrainSmoke();
export function resetTrainSmoke() { state = createTrainSmoke(); }
export function getTrainSmoke(): SmokeState { return { ...state, puffs: state.puffs.map(p => ({ ...p })) }; }
export function restoreTrainSmoke(s?: SmokeState) { state = s ? { ...s, puffs: s.puffs.map(p => ({ ...p })) } : createTrainSmoke(); }
export function smokeRadius(p: SmokePuff, w: number) { return w * (0.075 + p.age * 0.045); }
export function smokeShade(p: SmokePuff) { return p.shade ?? (p.black ? 1 : 0); }
export function smokeOpacity(p: SmokePuff) {
  return (0.065 + 0.895 * smokeShade(p) ** 2) * (p.strength ?? 1) * Math.min(1, p.age / 0.18) * Math.min(1, (4.5 - p.age) / 1.2);
}
export type SmokeBody = { x: number; y: number; r: number; sootLeft?: number };
export function sootFilter(left = 0) {
  const strength = Math.min(1, left / 0.65);
  return `grayscale(${strength}) brightness(${1 - strength * 0.88})`;
}
type SmokeRoute = { phase: "parked" | "accel" | "cruise" | "decel"; phaseT: number; stationIndex: number };
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** Deterministic variation keeps future emissions stable when rewinding. */
function variation(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
export function smokeExhaust(route: SmokeRoute, speed: number) {
  if (route.phase === "parked" || speed <= 1) return { strength: 0, shade: 0 };
  let t = route.phaseT, duration = 3.4, darkness = 0;
  if (route.phase === "accel") {
    t -= t < 4.6 ? 0.4 : 4.6;
    duration = 3.2;
    darkness = route.phaseT < 4.6 ? 0.95 : 0.35;
  } else if (route.phase === "cruise") {
    const period = 16 + variation(route.stationIndex + 9) * 5;
    const cycle = Math.floor(t / period);
    t = t % period - (period - duration);
    darkness = variation(cycle + route.stationIndex * 13 + 2) > 0.65 ? 0.95 : 0.12;
  } else {
    duration = 2.5;
    darkness = 0.08;
  }
  if (t <= 0 || t >= duration) return { strength: 0, shade: 0 };
  const strength = smooth(t / 0.65) * smooth((duration - t) / 0.9);
  // A long ramp through gray on both sides of each brief sooty core.
  const shade = darkness * Math.sin(Math.PI * t / duration) ** 2;
  return { strength: strength * (route.phase === "decel" ? 0.5 : 1), shade };
}
/** Coordinates are normalized so resizing never leaves smoke stranded off-screen. */
export function stepTrainSmoke(dt: number, speed: number, w: Pick<World, "w" | "h" | "floorY">, bodies: SmokeBody[], route?: SmokeRoute) {
  if (!Number.isFinite(dt) || dt < 0) return;
  state.clock += dt;
  for (const p of state.puffs) {
    p.age += dt;
    p.x -= (0.012 + Math.max(0, speed) * 0.85 / w.w) * dt;
    p.y -= (0.12 + 0.015 * Math.sin(p.seed + p.age * 2)) * dt;
  }
  state.puffs = state.puffs.filter(p => p.age < 4.5 && p.x > -0.5);
  const exhaust = smokeExhaust(route ?? { phase: "accel", phaseT: state.clock % 8, stationIndex: 0 }, speed);
  if (exhaust.strength > 0.02) {
    state.emission += dt;
    const interval = 0.12;
    while (state.emission >= interval) {
      state.emission -= interval;
      state.puffs.push({ x: 1.015, y: w.floorY / w.h - 0.055, age: 0,
        black: exhaust.shade >= 0.65, shade: exhaust.shade, strength: exhaust.strength, seed: state.clock * 7 });
    }
  } else state.emission = 0;
  for (const b of bodies) {
    b.sootLeft = Math.max(0, (b.sootLeft ?? 0) - dt);
    if (state.puffs.some(p => smokeShade(p) >= 0.65 && smokeOpacity(p) > 0.3 &&
      Math.hypot(b.x - p.x * w.w, b.y - p.y * w.h) < smokeRadius(p, w.w) * 0.8 + b.r)) b.sootLeft = 2;
  }
}
export function drawTrainSmoke(ctx: CanvasRenderingContext2D, w: Pick<World, "w" | "h">) {
  ctx.save();
  for (const p of state.puffs) {
    const r = smokeRadius(p, w.w), x = p.x * w.w, y = p.y * w.h;
    const opacity = smokeOpacity(p), shade = smokeShade(p);
    const rgb = [239 - 217 * shade, 243 - 219 * shade, 240 - 215 * shade].map(Math.round).join(",");
    // A dense center and soft rolling silhouette, without opaque rectangular sprites.
    for (let i = 0; i < 3; i++) {
      const a = p.seed + i * 2.094;
      const cx = x + Math.cos(a) * r * 0.25, cy = y + Math.sin(a) * r * 0.23;
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${opacity})`);
      g.addColorStop(0.65, `rgba(${rgb},${opacity * 0.75})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
