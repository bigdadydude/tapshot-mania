export type SupportSegment = { x0: number; y0: number; x1: number; y1: number; halfW: number };
type Point = { x: number; y: number };
export type SupportHit = Point & { t: number; nx: number; ny: number; px: number; py: number };

/** First time of impact against the complete capsule, including its end caps.
 * The normal belongs to the incoming side, never to an already tunneled endpoint. */
export function sweepSupport(from: Point, to: Point, radius: number, segment: SupportSegment): SupportHit | null {
  const {x0, y0, x1, y1} = segment;
  const dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy);
  const ux = length ? dx / length : 1, uy = length ? dy / length : 0;
  const vx = to.x - from.x, vy = to.y - from.y, rr = radius + segment.halfW;
  const nearest = (p: Point) => {
    const along = Math.max(0, Math.min(length, (p.x - x0) * ux + (p.y - y0) * uy));
    return {x: x0 + along * ux, y: y0 + along * uy};
  };
  const start = nearest(from), distance = Math.hypot(from.x - start.x, from.y - start.y);
  if (distance < rr - 1e-7) {
    let nx = distance > 1e-7 ? (from.x - start.x) / distance : -uy;
    let ny = distance > 1e-7 ? (from.y - start.y) / distance : ux;
    if (distance <= 1e-7 && nx * vx + ny * vy > 0) { nx = -nx; ny = -ny; }
    // A separating/sliding ball keeps its travel. Old swept overlaps must not
    // repeatedly drag it back to where the previous contact started.
    if (vx * nx + vy * ny >= 0) {
      const end = nearest(to), d = Math.hypot(to.x - end.x, to.y - end.y);
      if (d >= rr) return null;
      return {t: 0, x: to.x + nx * (rr - d), y: to.y + ny * (rr - d), nx, ny, px: end.x, py: end.y};
    }
    return {t: 0, x: start.x + nx * rr, y: start.y + ny * rr, nx, ny, px: start.x, py: start.y};
  }
  let hit: SupportHit | null = null;
  const accept = (t: number, nx: number, ny: number, px: number, py: number) => {
    if (t < 0 || t > 1 || vx * nx + vy * ny >= -1e-8 || (hit && hit.t <= t)) return;
    hit = {t, x: from.x + vx * t, y: from.y + vy * t, nx, ny, px, py};
  };
  const normalSpeed = -uy * vx + ux * vy;
  if (length > 1e-7 && Math.abs(normalSpeed) > 1e-8) {
    const offset = -uy * (from.x - x0) + ux * (from.y - y0);
    for (const sign of [-1, 1]) {
      const t = (sign * rr - offset) / normalSpeed;
      const x = from.x + vx * t, y = from.y + vy * t;
      const along = (x - x0) * ux + (y - y0) * uy;
      if (along >= 0 && along <= length) accept(t, -uy * sign, ux * sign, x0 + along * ux, y0 + along * uy);
    }
  }
  const speed2 = vx * vx + vy * vy;
  if (speed2 > 1e-8) for (const p of [{x: x0, y: y0}, {x: x1, y: y1}]) {
    const ox = from.x - p.x, oy = from.y - p.y;
    const b = ox * vx + oy * vy, c = ox * ox + oy * oy - rr * rr;
    const discriminant = b * b - speed2 * c;
    if (discriminant < 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / speed2;
    accept(t, (ox + vx * t) / rr, (oy + vy * t) / rr, p.x, p.y);
  }
  return hit;
}

/** Solid convex connector, including a safe escape from embedded snapshots. */
export function supportPolygonOverlap(point: Point, radius: number, vertices: readonly Point[]): SupportHit | null {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    area += a.x * b.y - a.y * b.x;
  }
  const winding = area >= 0 ? 1 : -1;
  let inside = true, best = Infinity, px = 0, py = 0, normalX = 0, normalY = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < 1e-8) continue;
    if ((dx * (point.y - a.y) - dy * (point.x - a.x)) * winding < -1e-8) inside = false;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length)));
    const x = a.x + t * dx, y = a.y + t * dy, distance = Math.hypot(point.x - x, point.y - y);
    if (distance < best) { best = distance; px = x; py = y; normalX = winding * dy / length; normalY = -winding * dx / length; }
  }
  if (!inside && best >= radius - 1e-7) return null;
  const nx = !inside && best > 1e-7 ? (point.x - px) / best : normalX;
  const ny = !inside && best > 1e-7 ? (point.y - py) / best : normalY;
  return {t: 0, x: px + nx * radius, y: py + ny * radius, px, py, nx, ny};
}

export function sweepSupportPolygon(from: Point, to: Point, radius: number, vertices: readonly Point[]): SupportHit | null {
  const overlap = supportPolygonOverlap(from, radius, vertices);
  if (overlap) {
    if ((to.x - from.x) * overlap.nx + (to.y - from.y) * overlap.ny >= 0) {
      return supportPolygonOverlap(to, radius, vertices);
    }
    return overlap;
  }
  let first: SupportHit | null = null;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
    const hit = sweepSupport(from, to, radius, {x0: a.x, y0: a.y, x1: b.x, y1: b.y, halfW: 0});
    if (hit && (!first || hit.t < first.t)) first = hit;
  }
  return first;
}
