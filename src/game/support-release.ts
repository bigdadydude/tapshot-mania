/** Small gameplay release for a high-bounce ball that has settled on a stand.
 * Only a slow top contact qualifies; never steer a flying ball. The caller
 * selects the free side (away from the board at a short connector). */
export function releaseSupportRest(
  ball: { vx: number; vy: number; r: number },
  side: -1 | 1,
  nx: number,
  ny: number,
  highBounce: boolean,
) {
  if (!highBounce || ny > -.7 || Math.abs(nx) > .5 || Math.hypot(ball.vx, ball.vy) > ball.r * 12) return false;
  ball.vx = side * ball.r * 12;
  ball.vy = -ball.r * 14;
  return true;
}
