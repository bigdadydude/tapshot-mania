/** City's 120-second ambient cycle: day, dusk, night, dawn. Uses simulation time. */
export function nightAmount(time: number) {
  const t = ((time % 120) + 120) % 120;
  const smooth = (p: number) => p * p * (3 - 2 * p);
  if (t < 30) return 0;
  if (t < 50) return smooth((t - 30) / 20);
  if (t < 90) return 1;
  return 1 - smooth((t - 90) / 30);
}
