/**
 * Streak after a basket. Clutch is not an input: a real buzzer make uses this
 * same step as any other make (bunshin ghosts still step by 1; rogue
 * comboboost still replaces that 1).
 */
export function streakAfterMake(input: {
  streak: number;
  comboCounting: boolean;
  bunshinGhost: boolean;
  /** Live rogue comboboost amount, or null when that buff is off. */
  comboBoost: number | null;
}): number {
  const step = input.bunshinGhost ? 1 : (input.comboBoost ?? 1);
  if (input.comboCounting) return input.streak + step;
  return step;
}

/** Streak added by one mini-me stack. Clutch makes are not skipped. */
export function miniMeStreakPerStack(): number {
  return 1;
}
