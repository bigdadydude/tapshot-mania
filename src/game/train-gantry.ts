import type { World } from "./types";

type Route = {
  tunnelBlocked?: boolean;
  tunnelRange?: { start: number; end: number };
  near: number;
  started: boolean;
  stationAt: number;
  nextStationAt: number;
  trainSpeed?: number;
  elapsed?: number;
};
type View = Pick<World, "w" | "h" | "floorY">;
export type GantryRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "beam" | "mast" | "signal";
};
export type TrainGantry = {
  id: number;
  x: number;
  y: number;
  width: number;
  rects: GantryRect[];
};
let seed = Math.random() * 100000;
export function resetTrainGantries() {
  seed = Math.random() * 100000;
}
function random(id: number, salt: number) {
  const n = Math.sin(id * 127.1 + salt * 311.7 + seed) * 43758.5453;
  return n - Math.floor(n);
}
const SPACING = 2400;
const FIRST = 1600;
/** Stable random heights per route object, shared by drawing and collision. */
export function getTrainGantries(
  world: View,
  route: Route,
  padding = 0,
): TrainGantry[] {
  if (!route.started || route.tunnelBlocked) return [];
  const u = world.w / 390,
    width = 48 * u,
    beamH = 18 * u,
    mastW = 14 * u;
  const result: TrainGantry[] = [];
  const first = Math.max(
    0,
    Math.floor((route.near - width - padding - FIRST) / SPACING),
  );
  const last = Math.max(
    first,
    Math.ceil((route.near + world.w + padding - FIRST) / SPACING),
  );
  for (let id = first; id <= last; id++) {
    const at = FIRST + id * SPACING;
    // Keep the tunnel's route segment clear after exit too: no suddenly appearing mast.
    if (route.tunnelRange && at >= route.tunnelRange.start - world.w && at <= route.tunnelRange.end + world.w) continue;
    // Clear station platforms so a parked train cannot be trapped by a mast.
    if (
      Math.abs(at - route.stationAt) < world.w * 1.6 ||
      Math.abs(at - route.nextStationAt) < world.w * 1.6
    )
      continue;
    const x = at - route.near;
    if (x > world.w + padding || x + width < -padding) continue;
    const top = world.h * 0.5;
    const y = top + random(id, 1) * Math.max(0, world.floorY - beamH - top);
    const rects: GantryRect[] = [
      { x, y, w: width, h: beamH, kind: "beam" },
      {
        x: x + width - mastW,
        y: y + beamH,
        w: mastW,
        h: world.h - y - beamH,
        kind: "mast",
      },
    ];
    // Along-track side elevation: the cross-track span is seen end-on.
    // A single near support and a suspended signal replace the front-facing portal.
    rects.push({
      x: x + 3 * u,
      y: y + beamH,
      w: 18 * u,
      h: 44 * u,
      kind: "signal",
    });
    result.push({ id, x, y, width, rects });
  }
  return result;
}

/** Continuous circle/rectangle sweep: faces plus rounded corners (no tunnelling). */
export function sweepGantryCircle(
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
  box: GantryRect,
) {
  let best: { t: number; nx: number; ny: number; depth: number } | null = null;
  const add = (t: number, nx: number, ny: number, depth = 0) => {
    if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, nx, ny, depth };
  };
  const qx = Math.max(box.x, Math.min(box.x + box.w, x)),
    qy = Math.max(box.y, Math.min(box.y + box.h, y));
  const dist = Math.hypot(x - qx, y - qy);
  if (dist < r) {
    if (dist > 1e-8)
      return {
        t: 0,
        nx: (x - qx) / dist,
        ny: (y - qy) / dist,
        depth: r - dist,
      };
    const sides = [
      { d: x - box.x, nx: -1, ny: 0 },
      { d: box.x + box.w - x, nx: 1, ny: 0 },
      { d: y - box.y, nx: 0, ny: -1 },
      { d: box.y + box.h - y, nx: 0, ny: 1 },
    ];
    sides.sort((a, b) => a.d - b.d);
    return { t: 0, nx: sides[0]!.nx, ny: sides[0]!.ny, depth: r + sides[0]!.d };
  }
  for (const [edge, nx] of [
    [box.x - r, -1],
    [box.x + box.w + r, 1],
  ]) {
    if (dx * nx! < 0) {
      const t = (edge! - x) / dx,
        py = y + dy * t;
      if (py >= box.y && py <= box.y + box.h) add(t, nx!, 0);
    }
  }
  for (const [edge, ny] of [
    [box.y - r, -1],
    [box.y + box.h + r, 1],
  ]) {
    if (dy * ny! < 0) {
      const t = (edge! - y) / dy,
        px = x + dx * t;
      if (px >= box.x && px <= box.x + box.w) add(t, 0, ny!);
    }
  }
  const a = dx * dx + dy * dy;
  if (a > 1e-12)
    for (const cx of [box.x, box.x + box.w])
      for (const cy of [box.y, box.y + box.h]) {
        const ox = x - cx,
          oy = y - cy,
          b = 2 * (ox * dx + oy * dy),
          c = ox * ox + oy * oy - r * r,
          disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a),
          nx = (x + dx * t - cx) / r,
          ny = (y + dy * t - cy) / r;
        if (
          (cx === box.x ? nx <= 0 : nx >= 0) &&
          (cy === box.y ? ny <= 0 : ny >= 0) &&
          dx * nx + dy * ny < 0
        )
          add(t, nx, ny);
      }
  return best as { t: number; nx: number; ny: number; depth: number } | null;
}

type MovingBall = { x: number; y: number; vx: number; vy: number; r: number };
export function collideTrainGantries(
  world: View,
  route: Route,
  ball: MovingBall,
  prevX: number,
  prevY: number,
  scrollDelta: number,
  dt: number,
  blockImpact?: (nx: number, ny: number) => boolean,
) {
  if (!(dt > 0)) return false;
  const objectVx = -scrollDelta / dt;
  const dx = ball.x - prevX + scrollDelta,
    dy = ball.y - prevY;
  const gantries = getTrainGantries(world, route, Math.abs(dx) + ball.r);
  let hit: ReturnType<typeof sweepGantryCircle> = null;
  for (const gantry of gantries)
    for (const rect of gantry.rects) {
      const found = sweepGantryCircle(prevX, prevY, dx, dy, ball.r, {
        ...rect,
        x: rect.x + scrollDelta,
      });
      if (found && (!hit || found.t < hit.t)) hit = found;
    }
  if (!hit) return false;
  if (blockImpact?.(hit.nx, hit.ny)) return false;
  // Move to contact in the final obstacle frame; discard remaining penetration.
  ball.x = prevX + dx * hit.t - scrollDelta + hit.nx * (hit.depth + 0.2);
  ball.y = prevY + dy * hit.t + hit.ny * (hit.depth + 0.2);
  const vn = (ball.vx - objectVx) * hit.nx + ball.vy * hit.ny;
  if (vn < 0) {
    ball.vx -= 1.65 * vn * hit.nx;
    ball.vy -= 1.65 * vn * hit.ny;
  }
  return true;
}

/** Warning shares the actual obstacle geometry and simulation clock. */
export function getTrainGantryWarnings(world: View, route: Route) {
  const speed = route.trainSpeed ?? 0;
  if (!route.started || speed <= 0) return [];
  const lead = Math.max(world.w * 0.8, speed * 1.5);
  return getTrainGantries(world, route, lead)
    .filter((g) => g.x > world.w && g.x <= world.w + lead)
    .map((g) => ({
      id: g.id,
      y: g.y,
      lit: Math.floor((route.elapsed ?? 0) * 5) % 2 === 0,
    }));
}

export function drawTrainGantries(
  ctx: CanvasRenderingContext2D,
  world: View,
  route: Route,
) {
  const u = world.w / 390;
  ctx.save();
  for (const g of getTrainGantries(world, route)) {
    for (const r of g.rects) {
      if (r.kind === "signal") {
        // Narrow housing viewed from the side, with hoods pointing down-track.
        ctx.fillStyle = "#63766d";
        ctx.fillRect(r.x + 7 * u, r.y, 4 * u, 8 * u);
        ctx.fillStyle = "#1a2629";
        ctx.fillRect(r.x, r.y + 8 * u, r.w, r.h - 8 * u);
        ctx.strokeStyle = "#819489";
        ctx.lineWidth = u;
        ctx.strokeRect(r.x, r.y + 8 * u, r.w, r.h - 8 * u);
        for (let i = 0; i < 3; i++) {
          const y = r.y + (14 + i * 10) * u;
          ctx.fillStyle = "#36423e";
          ctx.fillRect(r.x, y - 4 * u, 8 * u, 3 * u);
          ctx.fillStyle = i === 0 ? "#f47a43" : "#394b40";
          ctx.fillRect(r.x + u, y, 3 * u, 4 * u);
        }
      } else if (r.kind === "beam") {
        // The girder's short end profile, with top/bottom flanges and rivets.
        ctx.fillStyle = "#3c514b";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#a6b5a3";
        ctx.fillRect(r.x, r.y, r.w, 3 * u);
        ctx.fillStyle = "#182e2c";
        ctx.fillRect(r.x, r.y + r.h - 4 * u, r.w, 4 * u);
        ctx.strokeStyle = "#7d9284";
        ctx.lineWidth = 1.5 * u;
        ctx.strokeRect(r.x + 4 * u, r.y + 5 * u, r.w - 8 * u, r.h - 10 * u);
        ctx.fillStyle = "#c3cabb";
        for (const fx of [0.17, 0.83]) {
          ctx.beginPath();
          ctx.arc(r.x + r.w * fx, r.y + r.h / 2, 1.5 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#3b5049";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#9bac98";
        ctx.fillRect(r.x, r.y, 3 * u, r.h);
        ctx.fillStyle = "#213732";
        ctx.fillRect(r.x + r.w - 3 * u, r.y, 3 * u, r.h);
        ctx.strokeStyle = "#799080";
        ctx.lineWidth = 1.5 * u;
        for (let y = r.y + 5 * u; y < world.h; y += 24 * u) {
          ctx.beginPath();
          ctx.moveTo(r.x + 3 * u, y);
          ctx.lineTo(r.x + r.w - 3 * u, Math.min(y + 20 * u, world.h));
          ctx.stroke();
        }
        for (
          let y = Math.max(r.y, world.floorY - 28 * u);
          y < Math.min(world.h, world.floorY + 28 * u);
          y += 10 * u
        ) {
          ctx.fillStyle = "#d3ae50";
          ctx.fillRect(r.x, y, r.w, 4 * u);
        }
      }
    }
  }
  ctx.restore();
}

export function drawTrainGantryWarnings(ctx: CanvasRenderingContext2D, world: View, route: Route) {
  const u = world.w / 390;
  ctx.save();
  // Fixed edge marker; disappears as soon as the corresponding obstacle enters.
  for (const warning of getTrainGantryWarnings(world, route)) {
    if (!warning.lit) continue;
    const x = world.w - 24 * u,
      y = Math.max(23 * u, Math.min(world.h - 25 * u, warning.y));
    ctx.fillStyle = "#ffd43c";
    ctx.strokeStyle = "#161c1c";
    ctx.lineWidth = 3 * u;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y - 20 * u);
    ctx.lineTo(x + 20 * u, y + 16 * u);
    ctx.lineTo(x - 20 * u, y + 16 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#161c1c";
    ctx.fillRect(x - 2 * u, y - 8 * u, 4 * u, 12 * u);
    ctx.beginPath();
    ctx.arc(x, y + 10 * u, 2.3 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
