import { reviewFlagsFor } from "./anticheat.ts";
import {
  LEADERBOARD_LIMIT,
  type PublicLeaderboardRow,
} from "./constants.ts";
import type { LeaderboardListQuery, SubmitRunInput } from "./payload.ts";
import { publicRowsFromStored, type StoredPublicFields } from "./public-row.ts";

/** Minimal query surface satisfied by getSql(). Kept local so tests need not load @/lib/db. */
export type LeaderboardSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export async function listPublicBoard(
  sql: LeaderboardSql,
  query: LeaderboardListQuery,
): Promise<PublicLeaderboardRow[]> {
  const rows = await sql.query<StoredPublicFields>(
    `select id, nickname, ball_label, score, peak_combo
     from leaderboard_runs
     where mode = $1 and scene_id = $2 and ball_id = $3
     order by score desc, peak_combo desc, submitted_at asc
     limit $4`,
    [query.mode, query.sceneId, query.ballId, LEADERBOARD_LIMIT],
  );
  return publicRowsFromStored(rows);
}

export async function insertLeaderboardRun(
  sql: LeaderboardSql,
  input: SubmitRunInput,
  id: string = crypto.randomUUID(),
): Promise<{ id: string; reviewFlags: string[] }> {
  const reviewFlags = reviewFlagsFor({
    mode: input.mode,
    score: input.score,
    recap: input.recap,
    timeline: input.timeline,
  });
  await sql.query(
    `insert into leaderboard_runs (
       id, mode, nickname, ball_id, ball_label, scene_id, scene_label, game_rev,
       score, peak_combo, recap, timeline, flags, review_flags
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb
     )`,
    [
      id,
      input.mode,
      input.nickname,
      input.recap.ballId,
      input.recap.ballLabel,
      input.recap.sceneId,
      input.recap.sceneLabel,
      input.recap.gameRev,
      input.score,
      input.recap.peakCombo,
      JSON.stringify(input.recap),
      JSON.stringify(input.timeline),
      JSON.stringify(input.flags),
      JSON.stringify(reviewFlags),
    ],
  );
  return { id, reviewFlags };
}
