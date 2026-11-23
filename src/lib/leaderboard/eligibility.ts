import type { BallId } from "../../game/balls.ts";
import type { SceneId } from "../../game/scenes.ts";
import type { PlayMode } from "../../game/types.ts";
import type { EligibilityFlags, LeaderboardMode } from "./constants.ts";

/** Local-save and lookup key for one mode + scene + ball board. */
export function leaderboardBoardKey(
  mode: LeaderboardMode,
  sceneId: SceneId,
  ballId: BallId,
): string {
  return `${mode}:${sceneId}:${ballId}`;
}

export function isLeaderboardMode(mode: string): mode is LeaderboardMode {
  return mode === "classic" || mode === "minute";
}

export function runEligibilityFlags(opts: {
  sandbox: boolean;
  balance: boolean;
  scoreLock: boolean;
  comboLock: boolean;
}): EligibilityFlags {
  return {
    sandbox: Boolean(opts.sandbox),
    balance: Boolean(opts.balance),
    scoreLock: Boolean(opts.scoreLock),
    comboLock: Boolean(opts.comboLock),
  };
}

export function isRunEligible(flags: EligibilityFlags): boolean {
  return !flags.sandbox && !flags.balance && !flags.scoreLock && !flags.comboLock;
}

export function ineligibleReason(flags: EligibilityFlags): string | null {
  if (!isRunEligible(flags)) return "本局不能上榜";
  return null;
}

/**
 * Offer a confirm-to-submit CTA after classic / 1-minute game-over.
 * Score must be greater than this device's last submitted score for that mode + scene + ball board.
 * Zero scores, rogue, and ineligible runs are never offered.
 */
export function shouldOfferSubmit(opts: {
  mode: PlayMode | string;
  score: number;
  lastSubmitted: number;
  flags: EligibilityFlags;
}): boolean {
  if (!isLeaderboardMode(opts.mode)) return false;
  if (!Number.isFinite(opts.score) || opts.score <= 0) return false;
  if (!isRunEligible(opts.flags)) return false;
  const last = Number.isFinite(opts.lastSubmitted) ? opts.lastSubmitted : 0;
  return opts.score > last;
}

export function lastSubmittedFor(
  mode: LeaderboardMode,
  sceneId: SceneId,
  ballId: BallId,
  save: {
    submittedByBoard?: Record<string, number>;
    submittedClassic?: number;
    submittedMinute?: number;
  },
): number {
  const value = save.submittedByBoard?.[leaderboardBoardKey(mode, sceneId, ballId)];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
