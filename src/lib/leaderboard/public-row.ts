import type { PublicLeaderboardDetail, PublicLeaderboardRow } from "./constants.ts";
import { parseRecap } from "./payload.ts";

export type StoredPublicFields = {
  id: string;
  nickname: string;
  ball_label: string;
  score: number;
  peak_combo: number;
};

export type StoredPublicDetail = {
  id: string;
  nickname: string;
  score: number;
  peak_combo: number;
  recap: unknown;
};

/** Shape a stored row for the public board. Rank is 1-based in list order. */
export function toPublicRow(row: StoredPublicFields, rank: number): PublicLeaderboardRow {
  return {
    id: row.id,
    rank,
    nickname: row.nickname,
    ballLabel: row.ball_label,
    score: Number(row.score),
    peakCombo: Number(row.peak_combo),
  };
}

export const PUBLIC_LIST_COLUMNS = [
  "id",
  "nickname",
  "ball_label",
  "score",
  "peak_combo",
] as const;

export const PUBLIC_DETAIL_COLUMNS = ["id", "nickname", "score", "peak_combo", "recap"] as const;

export const PUBLIC_DETAIL_SELECT = `select id, nickname, score, peak_combo, recap
     from leaderboard_runs
     where id = $1`;

export function publicRowsFromStored(rows: StoredPublicFields[]): PublicLeaderboardRow[] {
  return rows.map((row, i) => toPublicRow(row, i + 1));
}

/** Map a stored run to the public detail payload. Extra private columns on the row are dropped. */
export function toPublicDetail(row: StoredPublicDetail): PublicLeaderboardDetail | null {
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.nickname !== "string") return null;
  const recap = parseRecap(row.recap);
  if (!recap) return null;
  const score = Number(row.score);
  const peakCombo = Number(row.peak_combo);
  if (!Number.isFinite(score) || !Number.isFinite(peakCombo)) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    score,
    peakCombo,
    recap,
  };
}
