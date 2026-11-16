/**
 * Champion-ball last-shot (buzzer) helpers.
 * Count limit removed: champClutchControlled marks "operated this window"
 * for half-clock / ×2, but must never reject later taps.
 */

/** Active champ last-shot window (wall-clock buzzerTimer still running). */
export function isChampClutchWindow(
  isChamp: boolean,
  buzzer: boolean,
  buzzerTimer: number,
): boolean {
  return isChamp && buzzer && buzzerTimer > 0;
}

/**
 * Buzzer / timeUp input lock for tapJump.
 * Champ clutch and rogue HeroMoment may tap; everyone else is locked out.
 * Does not consult champClutchControlled (no operation-count limit).
 */
export function buzzerRejectsTap(opts: {
  buzzer: boolean;
  timeUp: boolean;
  heroClutch: boolean;
  champClutch: boolean;
}): boolean {
  return (opts.buzzer || opts.timeUp) && !opts.heroClutch && !opts.champClutch;
}

/**
 * Classic / rogue: after a clutch make, next shot clock is halved when the
 * player operated at least once in that window.
 */
export function champClutchAppliesHalfClock(opts: {
  clutchMake: boolean;
  isChamp: boolean;
  isMinuteMode: boolean;
  champClutchControlled: boolean;
}): boolean {
  return (
    opts.clutchMake &&
    opts.isChamp &&
    !opts.isMinuteMode &&
    opts.champClutchControlled
  );
}
