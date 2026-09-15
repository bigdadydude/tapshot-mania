/**
 * Human-demo priors for auto-play. Hierarchy:
 *   1. Physics hard limits (tapJump full reset, finishPocketLocked)
 *   2. These mined JSON stats (ninja 310 / 2641 / 1324, glass 10156 / 5992,
 *      sep15 gold classic: ninja 1411/97 + 1196/85, frost 1985/50, lava 1264/43)
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
   * Oral apex-boost / extra climb taps after the launch. Ninja 310: floor
   * jump then one recatch, then ride.
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
 * Classic ninja first-make geometry (sep15 gold 1411/97, 1196/85, 660/65, 502/53).
 * Spawn |dx| ≈ 237 sits in the launch band. Apex travel ~129px, so a floor
 * jump from ≳0.64w (~250) peaks outside the too-low recatch window and the
 * clock never arms. Recatch 0.36w tapped too early (iron on the way up).
 */
export const NINJA_OPENER = {
  launchMin: 0.5,
  launchMax: 0.64,
  recatchMin: 0.28,
  recatchMax: 0.34,
} as const;

/** Ninja 1-min 310 + elite classic 2641/1324 + sep15 gold 1411/97, 1196/85. */
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
