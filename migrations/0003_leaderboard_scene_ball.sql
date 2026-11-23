-- Per-board public lists: top scores for one mode + scene + ball.
create index if not exists leaderboard_runs_scene_ball_idx
  on leaderboard_runs (mode, scene_id, ball_id, score desc, peak_combo desc, submitted_at asc);
