import type { World } from "./types";
import type { TrainScroll } from "./train-bg";
import { sweepGantryCircle } from "./train-gantry.ts";

type View = Pick<World, "w" | "h" | "floorY" | "ballR">;
export type TrainTunnel = {
  stage: "idle" | "waiting" | "passing" | "done";
  leg: number;
  depth: number;
  progress: number;
  speed: number;
  startAt: number;
  endAt: number;
};
const initial = (): TrainTunnel => ({ stage: "idle", leg: -1, depth: 0, progress: 0, speed: 540, startAt: 0, endAt: 0 });
let state = initial();
export function resetTrainTunnel() { state = initial(); }
export function getTrainTunnel() { return { ...state }; }
export function restoreTrainTunnel(value: TrainTunnel) { state = { ...value }; }
export function tunnelPassing() { return state.stage === "passing"; }
export function tunnelReserved() { return state.stage === "waiting" || tunnelPassing(); }
export function tunnelHoopMin(w: View) {
  // Preserve the whole backboard plus a ball-sized gap and room for a scoring arc.
  return tunnelReserved() ? w.h * state.depth + Math.max(w.h * 0.194, w.ballR * 4.5) : 0;
}
export function tunnelGeometry(w: View) {
  // Two seconds of approach, six seconds of tunnel, then its trailing edge.
  const x = w.w + state.speed * (2 - state.progress);
  return { x, end: x + state.speed * 6, roof: w.h * state.depth };
}
/** A reserved entrance waits for existing targets/ball/obstacles to be safe. */
export function stepTrainTunnel(route: TrainScroll, w: View, dt: number, safe: () => boolean, rng = Math.random) {
  if (state.leg !== route.stationIndex) { state = { ...initial(), leg: route.stationIndex }; }
  if (route.phase !== "cruise") {
    if (tunnelReserved()) state.stage = "done";
    return;
  }
  const remaining = route.legSeconds - 16 - route.phaseT;
  const duration = 8 + w.w / Math.max(1, route.trainSpeed);
  if (state.stage === "idle" && route.phaseT >= 4 && remaining > duration + 2) {
    state.stage = "waiting";
    state.depth = rng() * (0.25 + rng() * 0.05);
    state.speed = route.trainSpeed;
  }
  if (state.stage === "waiting") {
    if (remaining <= duration + 1) { state.stage = "done"; return; }
    if (safe()) {
      state.stage = "passing"; state.progress = 0;
      state.startAt = route.near + w.w + state.speed * 2;
      state.endAt = state.startAt + state.speed * 6;
    }
  } else if (state.stage === "passing") {
    state.progress += dt;
    if (tunnelGeometry(w).end <= 0) state.stage = "done";
  }
}

export function collideTunnel(w: View, ball: { x: number; y: number; vx: number; vy: number; r: number }, px: number, py: number, dt: number) {
  if (!tunnelPassing()) return false;
  const g = tunnelGeometry(w), shift = state.speed * dt;
  const dx = ball.x - px + shift, dy = ball.y - py;
  const hit = sweepGantryCircle(px, py, dx, dy, ball.r,
    { x: g.x + shift, y: -w.h * 4, w: g.end - g.x, h: w.h * 4 + g.roof, kind: "beam" });
  if (!hit) return false;
  ball.x = px + dx * hit.t - shift + hit.nx * (hit.depth + 0.2);
  ball.y = py + dy * hit.t + hit.ny * (hit.depth + 0.2);
  const vn = (ball.vx + state.speed) * hit.nx + ball.vy * hit.ny;
  if (vn < 0) { ball.vx -= 1.65 * vn * hit.nx; ball.vy -= 1.65 * vn * hit.ny; }
  return true;
}

/** Side-on masonry interior, behind the train and playable objects. */
export function drawTunnel(ctx: CanvasRenderingContext2D, w: View) {
  if (!tunnelPassing()) return;
  const g = tunnelGeometry(w);
  if (g.x >= w.w || g.end <= 0) {
    if (g.x >= w.w) {
      ctx.save(); ctx.textAlign = "right"; ctx.font = `bold ${Math.max(12, w.w * 0.034)}px sans-serif`;
      ctx.fillStyle = "#f9d993"; ctx.fillText("隧道即将到来", w.w - 14, w.h * 0.13); ctx.restore();
    }
    return;
  }
  const left = Math.max(0, g.x), right = Math.min(w.w, g.end), u = w.w / 390;
  ctx.save(); ctx.beginPath(); ctx.rect(left, 0, right - left, w.h); ctx.clip();
  const shade = ctx.createLinearGradient(0, g.roof, 0, w.h);
  shade.addColorStop(0, "#303942"); shade.addColorStop(0.55, "#4d5558"); shade.addColorStop(1, "#242b30");
  ctx.fillStyle = shade; ctx.fillRect(left, 0, right - left, w.h);
  const row = 28 * u, brick = 78 * u;
  ctx.lineWidth = u; ctx.strokeStyle = "#68706e55";
  for (let y = g.roof; y < w.h; y += row) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    const offset = (g.x * 0.55 + (Math.floor(y / row) % 2) * brick / 2) % brick;
    for (let x = offset - brick; x < w.w; x += brick) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + row); ctx.stroke();
    }
  }
  // Lamps scroll with the wall; their glow keeps the play area readable.
  const spacing = 240 * u;
  for (let x = ((g.x * 0.55) % spacing) - spacing; x < w.w + spacing; x += spacing) {
    const y = g.roof + 35 * u;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 100 * u);
    glow.addColorStop(0, "#ffd88755"); glow.addColorStop(1, "#ffd88700");
    ctx.fillStyle = glow; ctx.fillRect(x - 100 * u, y - 100 * u, 200 * u, 200 * u);
    ctx.fillStyle = "#161e24"; ctx.fillRect(x - 14 * u, y - 7 * u, 28 * u, 14 * u);
    ctx.fillStyle = "#ffe6a8"; ctx.fillRect(x - 10 * u, y - 3 * u, 20 * u, 6 * u);
  }
  ctx.fillStyle = "#20282b"; ctx.fillRect(left, 0, right - left, g.roof);
  ctx.strokeStyle = "#687474"; ctx.lineWidth = 5 * u;
  ctx.beginPath(); ctx.moveTo(left, g.roof - 2 * u); ctx.lineTo(right, g.roof - 2 * u); ctx.stroke();
  // Rock courses above the flat, accurately collidable ceiling.
  ctx.strokeStyle = "#465253"; ctx.lineWidth = 2 * u;
  for (let y = g.roof - 25 * u; y > 0; y -= 30 * u) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }
  for (const x of [g.x, g.end - 20 * u]) {
    ctx.fillStyle = "#717c79"; ctx.fillRect(x, 0, 20 * u, w.h);
    ctx.fillStyle = "#a5a68c";
    for (let y = 0; y < w.h; y += 32 * u) ctx.fillRect(x, y, 20 * u, 3 * u);
  }
  ctx.restore();
}
