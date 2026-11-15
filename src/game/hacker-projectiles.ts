/** Pure, relative-motion contact helpers for Hacker's non-rebounding knockdowns. */
export type Point = { x: number; y: number };

/** Includes initial overlap, tangency and complete high-speed crossings. */
export function sweptCircleContact(
  from: Point, to: Point, otherFrom: Point, otherTo: Point, radius: number,
): boolean {
  const x = from.x - otherFrom.x, y = from.y - otherFrom.y;
  const dx = to.x - from.x - (otherTo.x - otherFrom.x);
  const dy = to.y - from.y - (otherTo.y - otherFrom.y);
  const speed2 = dx * dx + dy * dy;
  const t = speed2 > 1e-8 ? Math.max(0, Math.min(1, -(x * dx + y * dy) / speed2)) : 0;
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 <= radius * radius;
}

export type HackerProjectile = Point & {
  vx: number; vy: number; r: number; falling: boolean; fadeLeft: number | null;
  /** Remains set even if a black hole later changes the visual falling state. */
  hackerRewarded?: boolean;
};

/** True means consumed by the knockdown path: caller must skip ordinary impact. */
export function hackerDropProjectile(
  projectile: HackerProjectile, previous: Point,
  ball: Point & { r: number }, ballPrevious: Point, reward?: () => void,
): boolean {
  if (projectile.falling || projectile.fadeLeft !== null || projectile.hackerRewarded || projectile.x < -9000) return false;
  if (!sweptCircleContact(previous, projectile, ballPrevious, ball, ball.r + projectile.r * 1.4)) return false;
  projectile.falling = true;
  projectile.hackerRewarded = true;
  projectile.vx = 0;
  projectile.vy = 0;
  reward?.();
  return true;
}
