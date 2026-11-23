-- Global leaderboard reports (phase 1). Unowned rows: no user_id, auth stays off.
-- Public list reads only nickname, ball_label, score, peak_combo (plus sort keys).
-- Full recap, timeline, eligibility flags, and review flags are kept for later human review.

create table if not exists leaderboard_runs (
  id              text primary key,
  mode            text not null check (mode in ('classic', 'minute')),
  nickname        text not null,
  ball_id         text not null,
  ball_label      text not null,
  scene_id        text not null,
  scene_label     text not null,
  game_rev        integer not null,
  score           integer not null,
  peak_combo      integer not null,
  recap           jsonb not null,
  timeline        jsonb not null,
  flags           jsonb not null,
  review_flags    jsonb not null,
  submitted_at    timestamptz not null default now()
);

create index if not exists leaderboard_runs_board_idx
  on leaderboard_runs (mode, score desc, peak_combo desc, submitted_at asc);
