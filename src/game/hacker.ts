import type { Hoop } from "./types";
import { beginHoopRetirement } from "./hoop-retirement.ts";

/** First playable tuning; probabilities are per event, never per frame. */
export const HACKER = {
  maxHoops: 4,
  pinChance: 0.65,
  retractBase: 0.1,
  retractPerHoop: 0.05,
  retractPerSecond: 0.005,
  retractCap: 0.6,
  blockFailure: [0, 0.1, 0.2, 0.3, 0.4],
};

export type HackerHoop = {
  state: "normal" | "pinned" | "retiring";
  pinned: boolean;
  age: number;
  scored: boolean;
};

export function hackerPinnedCount(hoops: readonly Hoop[]) {
  return hoops.filter(h => h.hacker?.pinned).length;
}

export function hackerRetractChance(count: number, age: number) {
  return Math.min(HACKER.retractCap, HACKER.retractBase + HACKER.retractPerHoop * Math.max(0, count - 1) + HACKER.retractPerSecond * Math.max(0, age));
}

export function hackerBlockFailure(count: number) {
  return HACKER.blockFailure[Math.max(0, Math.min(4, Math.floor(count)))];
}

/** Preserve a failed result for this object for the rest of this awakening. */
export function hackerIntercept(target: { hackerAttempt?: { epoch: number; blocked: boolean } }, epoch: number, count: number, random = Math.random) {
  if (target.hackerAttempt?.epoch !== epoch) {
    target.hackerAttempt = { epoch, blocked: random() >= hackerBlockFailure(count) };
  }
  return target.hackerAttempt.blocked;
}

export function retireHackerHoop(h: Hoop) {
  if (!h.hacker || h.hacker.state === "retiring") return;
  h.hacker.state = "retiring";
  beginHoopRetirement(h);
}

export function settleHackerHoops(hoops: readonly Hoop[], scored: Hoop, random = Math.random) {
  const count = hoops.length;
  const state = scored.hacker;
  if (state?.state === "normal") {
    state.pinned = random() < HACKER.pinChance;
    if (state.pinned) state.state = "pinned";
    else retireHackerHoop(scored);
    state.age = 0;
  }
  const pinned = hackerPinnedCount(hoops);
  for (const h of hoops) {
    if (h.hacker?.state === "pinned" && random() < hackerRetractChance(pinned, h.hacker.age)) {
      retireHackerHoop(h);
    }
  }
  return count;
}

export type HoopBounds = { left: number; right: number; top: number; bottom: number };
export function hackerSpaceClear(candidate: HoopBounds, others: readonly HoopBounds[], gap = 12) {
  return others.every(b => candidate.right + gap <= b.left || candidate.left >= b.right + gap || candidate.bottom + gap <= b.top || candidate.top >= b.bottom + gap);
}
