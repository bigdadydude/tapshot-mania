import type { RunRecap } from "../../game/types.ts";
import type { EligibilityFlags } from "./constants.ts";
import { shouldOfferSubmit } from "./eligibility.ts";

/**
 * True when this device has not confirmed a nickname yet.
 * The display default 玩家 is not treated as a chosen name.
 */
export function shouldAskFirstNickname(savedNickname: string | null | undefined): boolean {
  return !savedNickname;
}

export type AutoSubmitPlan = "ask-name" | "submit" | "skip";

/**
 * After a classic / 1-minute game-over, decide whether to prompt for a first
 * name, auto-submit immediately, or do nothing.
 */
export function autoSubmitPlan(opts: {
  mode: string;
  score: number;
  lastSubmitted: number;
  flags: EligibilityFlags;
  savedNickname: string | null | undefined;
}): AutoSubmitPlan {
  if (
    !shouldOfferSubmit({
      mode: opts.mode,
      score: opts.score,
      lastSubmitted: opts.lastSubmitted,
      flags: opts.flags,
    })
  ) {
    return "skip";
  }
  if (shouldAskFirstNickname(opts.savedNickname)) return "ask-name";
  return "submit";
}

/** Stable-enough key for this run, used to ignore remounted auto-submit effects. */
export function autoSubmitRunKey(
  recap: Pick<
    RunRecap,
    | "playMode"
    | "sceneId"
    | "ballId"
    | "score"
    | "durationSeconds"
    | "makes"
    | "misses"
    | "clicks"
    | "holds"
    | "peakCombo"
    | "peakMake"
    | "skillInputs"
  >,
): string {
  return [
    recap.playMode,
    recap.sceneId,
    recap.ballId,
    recap.score,
    recap.durationSeconds,
    recap.makes,
    recap.misses,
    recap.clicks,
    recap.holds,
    recap.peakCombo,
    recap.peakMake,
    recap.skillInputs,
  ].join(":");
}
