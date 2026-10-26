import type { Hoop } from "./types";

export const HOOP_HOLD = 0.72;

/** Begin the ordinary post-score hold, followed by a slide off the court. */
export function beginHoopRetirement(h: Hoop) {
  h.moving = false;
  h.jolt = 0;
  h.couple = true;
  h.hold = HOOP_HOLD;
  h.targetX = h.x;
}

/** Caller moves the net by the returned delta. Frozen hoops skip this step. */
export function stepHoopRetirement(h: Hoop, width: number, dt: number) {
  const ox = h.x;
  const wasHolding = h.hold > 0;
  const held = Math.min(h.hold, dt);
  h.hold = Math.max(0, h.hold - dt);
  if (wasHolding && h.hold === 0) {
    h.couple = false;
    h.jolt = 0;
    h.targetX = h.side < 0 ? -width * 0.42 : width * 1.42;
  }
  h.x += (h.targetX - h.x) * (1 - Math.exp(-7.5 * (dt - held)));
  return h.x - ox;
}

export function hoopRetirementDone(h: Hoop, width: number) {
  return h.side < 0 ? h.x < -width * 0.28 : h.x > width * 1.28;
}
