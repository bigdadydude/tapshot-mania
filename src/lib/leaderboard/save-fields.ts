import { parseSavedNickname } from "./nickname.ts";

export type LeaderboardSaveFields = {
  nickname: string;
  submittedClassic: number;
  submittedMinute: number;
};

export const LEADERBOARD_SAVE_DEFAULTS: LeaderboardSaveFields = {
  nickname: "",
  submittedClassic: 0,
  submittedMinute: 0,
};

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Map raw localStorage fields onto nickname + last submitted scores without dropping other save data. */
export function leaderboardSaveFieldsFrom(raw: unknown): LeaderboardSaveFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    nickname: parseSavedNickname(src.nickname),
    submittedClassic: nonNegativeInt(src.submittedClassic),
    submittedMinute: nonNegativeInt(src.submittedMinute),
  };
}
