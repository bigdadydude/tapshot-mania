/** Score only a real passage through the opening, never a support-side fall
 * or a remembered visit above the rim. Sweep the center to retain fast makes. */
export function rimPassage(
  rim: { x: number; y: number; inner: number },
  ball: { x: number; y: number; r: number; vy: number },
  previous: { x: number; y: number },
  allowUpward: boolean,
  previousRim: { x: number; y: number } = rim,
): "down" | "up" | null {
  // Both bodies move during the step. Test in the rim's relative frame so
  // an ascending rim cannot skip a make, or chase a falling ball into a false one.
  const fromY = previous.y - previousRim.y;
  const toY = ball.y - rim.y;
  const down = fromY < 0 && toY >= 0;
  const up = allowUpward && fromY > 0 && toY <= 0;
  if (!down && !up) return null;
  const t = -fromY / (toY - fromY);
  const fromX = previous.x - previousRim.x;
  const x = fromX + (ball.x - rim.x - fromX) * t;
  // Match the rim opening: shrinking it by ball radius leaves an invisible
  // strip that rejects rim-grazing makes. Never expand into the supports.
  if (Math.abs(x) >= Math.max(0, rim.inner)) return null;
  return down ? "down" : "up";
}
