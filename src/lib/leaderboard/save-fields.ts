import { parseSavedNickname } from "./nickname.ts";

export type LeaderboardSaveFields = {
  nickname: string;
  submittedClassic: number;
  submittedMinute: number;
  /** Last submitted score per `mode:sceneId:ballId` board. */
  submittedByBoard: Record<string, number>;
};

export const LEADERBOARD_SAVE_DEFAULTS: LeaderboardSaveFields = {
  nickname: "",
  submittedClassic: 0,
  submittedMinute: 0,
  submittedByBoard: {},
};

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseSubmittedByBoard(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key) continue;
    const n = nonNegativeInt(value);
    if (typeof value === "number" && Number.isFinite(value)) out[key] = n;
  }
  return out;
}

/** Map raw localStorage fields onto nickname + last submitted scores without dropping other save data. */
export function leaderboardSaveFieldsFrom(raw: unknown): LeaderboardSaveFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    nickname: parseSavedNickname(src.nickname),
    submittedClassic: nonNegativeInt(src.submittedClassic),
    submittedMinute: nonNegativeInt(src.submittedMinute),
    submittedByBoard: parseSubmittedByBoard(src.submittedByBoard),
  };
}
