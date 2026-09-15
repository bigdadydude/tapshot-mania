/**
 * Human-demo priors for auto-play. Hierarchy:
 *   1. Physics hard limits (tapJump full reset, finishPocketLocked)
 *   2. These mined JSON stats (ninja 310 / 2641 / 1324, glass 10156 / 5992,
 *      sep15 gold classic: ninja 1411/97 + 1196/85 + HQ 9806/277, frost 1985/50,
 *      lava 1264/43)
 *   3. Oral 8-tactic playbook — soft hints only
 *
 * Re-mine with:
 *   node --experimental-strip-types scripts/summarize-recording.mjs <pack.json>
 * Packs live under `/workspace/human-recordings/` when present. This module
 * is the compiled snapshot so the browser AI never reads the filesystem.
 * Opener pass (first make): `summarizePlayRecording(rec).opener`.
 */
import { shotFeel } from "./feel.ts";
import type { AiWorld } from "./types.ts";

export type DemoPriors = {
  /** Median taps in ~1.6s before a make. Ninja 310 ≈ 2. */
  medianTapsBeforeMake: number;
  /** Extra taps to hunt a swish. Ninja 310: 0 swishes. Glass: yes (+4 HP). */
  huntSwish: boolean;
  /**
   * Oral "tap to force a bank" (bank-cut / predicted-bank). Demos finish with
   * few taps near the glass — a full jumpVx reset overshoots. Classic 1324
   * is bank-heavy but the kiss is a held inbound, plus a rare classic cut.
   */
  bankCutTap: boolean;
  /**
   * Oral apex-boost mash (default policy). Sep15 ninja climb is *not* this —
   * it is 3–4 spaced `early-jump` taps in physPolicy (`NINJA_OPENER`).
   */
  extraClimbTaps: boolean;
  /** Oral combo-clock poke near the hoop. Conflicts with the 2-tap ride. */
  comboPokeNearHoop: boolean;
  /** Hold an inbound half-board / glass path (demos bank a lot). */
  holdInboundBank: boolean;
  /** Wrap is a next shot, not a hover (310: 4/8 wraps scored <2.5s). */
  wrapRecovery: boolean;
  /** Hot bounce: let spacing open, then re-attack. */
  popAway: boolean;
  /** After hole-open, spam / ride (anti packs). */
  holeSpamAfterOpen: boolean;
};

/**
 * Sep15 gold classic ninja openers. Extracted from pack JSON — first
 * finish = bank, 0 wraps before first make:
 *
 *   502/53, 660/65, 1196/85, 1411/97: first make 1.23–1.57s, **3 taps**,
 *   |dx| ~200 → 147 → 95 (~150ms apart), same full jump vector, ride
 *   into bank (+ rim). Chain the other hoop with 2–3 taps at |dx|
 *   ~190–260, median gap 1.33–1.69s.
 *
 *   HQ 9806/277 (188s): first make 2.13s, **4 taps**,
 *   |dx| 194 → 140 → 96 → 118, then chain right 259 / 122.
 *   Median taps in 1.6s before makes: 2; median first-tap |dx|: 226.
 */
export const NINJA_OPENER = {
  /** Floor launch |dx|/w. First tap ~194–201; chain ~190–260. */
  launchMin: 0.49,
  launchMax: 0.67,
  /** Climb taps 2–4 while still rising. Human 135–152, then 92–102, then ~118 after a rim. */
  climbMin: 0.23,
  climbMax: 0.41,
  /** Human ~150ms between opener taps. */
  tapGap: 0.15,
  /** Floor + up to 3 air taps (HQ 4-tap), then ride. A 5th air tap is wrap spam. */
  maxAirTaps: 3,
} as const;

/** Ninja 1-min 310 + elite classic 2641/1324 + sep15 gold 1411/97, 1196/85, HQ 9806/277. */
const NINJA: DemoPriors = {
  medianTapsBeforeMake: 2,
  huntSwish: false,
  bankCutTap: false,
  extraClimbTaps: false,
  comboPokeNearHoop: false,
  holdInboundBank: true,
  wrapRecovery: true,
  popAway: true,
  holeSpamAfterOpen: true,
};

/** Glass classic 10156 / 117 and 5992 / 88 — climb, then drop-finish. */
const GLASS: DemoPriors = {
  medianTapsBeforeMake: 3.6,
  huntSwish: true,
  bankCutTap: false,
  extraClimbTaps: true,
  comboPokeNearHoop: false,
  holdInboundBank: true,
  wrapRecovery: true,
  popAway: true,
  holeSpamAfterOpen: true,
};

/**
 * Classic 2641 / 138, 1324 / 97, plus sep15 gold frost 1985/50 / 1285/37
 * and lava 1264/43 — banks from inbound holds + rare kiss-cuts.
 */
const CLASSIC: DemoPriors = {
  medianTapsBeforeMake: 3,
  huntSwish: true,
  bankCutTap: true,
  extraClimbTaps: true,
  comboPokeNearHoop: true,
  holdInboundBank: true,
  wrapRecovery: true,
  popAway: true,
  holeSpamAfterOpen: true,
};

export function demoPriors(world: AiWorld): DemoPriors {
  if (world.kit.glass) return GLASS;
  if (shotFeel(world).longJump) return NINJA;
  return CLASSIC;
}
