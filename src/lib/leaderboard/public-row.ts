import type { PublicLeaderboardRow } from "./constants.ts";

export type StoredPublicFields = {
  id: string;
  nickname: string;
  ball_label: string;
  score: number;
  peak_combo: number;
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

export function publicRowsFromStored(rows: StoredPublicFields[]): PublicLeaderboardRow[] {
  return rows.map((row, i) => toPublicRow(row, i + 1));
}
