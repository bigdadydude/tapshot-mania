/** Player-facing notice on the board and on a first submit. */
export const LEADERBOARD_PRIVACY_NOTICE =
  "成绩和游玩数据会上传，用于排名和反作弊。只用昵称，不收集真实身份。";

export const LEADERBOARD_LIMIT = 100;
export const NICKNAME_MAX_CHARS = 16;

/** Timeline event timestamps are seconds of armed match-clock drain. */
export const TIMELINE_CLOCK =
  "t is seconds of armed match-clock drain accumulated since the run started (the same accumulator as recap.durationSeconds / clockSeconds). Events before the clock arms are recorded at t = 0. The timeline is not part of the Time Ball rewind snapshot and is not rolled back on rewind.";

export const TIMELINE_MAX_EVENTS = 20_000;

export type LeaderboardMode = "classic" | "minute";

export type TimelineEventKind = "tap" | "hold_start" | "hold_release" | "skill" | "make" | "score";

export type TimelineEvent = {
  /** Seconds of armed match-clock drain; pre-arm events use 0. */
  t: number;
  kind: TimelineEventKind;
  /** Points awarded for kind === "score". */
  points?: number;
};

export type EligibilityFlags = {
  sandbox: boolean;
  balance: boolean;
  scoreLock: boolean;
  comboLock: boolean;
};

export type ReviewFlag =
  | "score_mismatch"
  | "score_without_makes"
  | "score_events_mismatch"
  | "minute_duration"
  | "inhuman_click_rate"
  | "classic_score_rate";

export type PublicLeaderboardRow = {
  id: string;
  rank: number;
  nickname: string;
  ballLabel: string;
  score: number;
  peakCombo: number;
};
