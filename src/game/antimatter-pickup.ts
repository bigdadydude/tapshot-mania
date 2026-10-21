type Circle = { x: number; y: number; r: number };

/** Swept circle contact also catches pickups crossed between physics steps. */
export function touchesAntimatter(
  from: { x: number; y: number }, ball: Circle, matter: Circle,
) {
  const dx = ball.x - from.x;
  const dy = ball.y - from.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0
    ? Math.max(0, Math.min(1, ((matter.x - from.x) * dx + (matter.y - from.y) * dy) / length2))
    : 0;
  return Math.hypot(from.x + dx * t - matter.x, from.y + dy * t - matter.y) <= ball.r + matter.r;
}
