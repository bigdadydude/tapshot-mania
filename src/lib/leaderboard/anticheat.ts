import type { RunRecap } from "../../game/types.ts";
import type { LeaderboardMode, ReviewFlag, TimelineEvent } from "./constants.ts";

/**
 * Conservative hard checks. Flagged rows are still accepted and shown.
 * Constants are documented here and asserted in tests — do not tighten them
 * into a scoring cap that would flag ordinary high-combo play.
 */

/** Minute mode is a fixed 60s clock. Durations clearly outside this window are flagged. */
export const MINUTE_DURATION_MIN = 50;
export const MINUTE_DURATION_MAX = 75;

/** clicks / duration, applied only when duration exceeds CLICK_RATE_MIN_DURATION. */
export const INHUMAN_CLICK_RATE = 10;
export const CLICK_RATE_MIN_DURATION = 5;

/**
 * Classic score-vs-duration is flagged only at absurd extremes.
 * Ordinary high-combo play stays well below 8000 points per armed-clock second
 * (even a long 100+ combo run is typically a few hundred points per second).
 */
export const CLASSIC_ABSURD_SCORE_PER_SECOND = 8000;
export const CLASSIC_ABSURD_MIN_DURATION = 1;
export const CLASSIC_ABSURD_INSTANT_SCORE = 50_000;

export function timelineScoreTotal(timeline: TimelineEvent[]): number {
  let sum = 0;
  for (const ev of timeline) {
    if (ev.kind === "score" && Number.isFinite(ev.points)) sum += ev.points ?? 0;
  }
  return sum;
}

export function reviewFlagsFor(opts: {
  mode: LeaderboardMode;
  score: number;
  recap: RunRecap;
  timeline: TimelineEvent[];
}): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const recap = opts.recap;
  const duration = recap.durationSeconds;
  const clicks = recap.clicks;
  const makes = recap.makes;

  if (opts.score !== recap.score) flags.push("score_mismatch");
  if (opts.score > 0 && makes <= 0) flags.push("score_without_makes");

  const awarded = timelineScoreTotal(opts.timeline);
  if (awarded !== opts.score) flags.push("score_events_mismatch");

  if (opts.mode === "minute") {
    if (!Number.isFinite(duration) || duration < MINUTE_DURATION_MIN || duration > MINUTE_DURATION_MAX) {
      flags.push("minute_duration");
    }
  }

  if (Number.isFinite(duration) && duration > CLICK_RATE_MIN_DURATION && clicks / duration > INHUMAN_CLICK_RATE) {
    flags.push("inhuman_click_rate");
  }

  if (opts.mode === "classic" && Number.isFinite(duration) && opts.score > 0) {
    const instant = duration < CLASSIC_ABSURD_MIN_DURATION && opts.score >= CLASSIC_ABSURD_INSTANT_SCORE;
    const rate = duration >= CLASSIC_ABSURD_MIN_DURATION && opts.score / duration > CLASSIC_ABSURD_SCORE_PER_SECOND;
    if (instant || rate) flags.push("classic_score_rate");
  }

  return flags;
}
