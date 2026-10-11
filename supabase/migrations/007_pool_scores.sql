-- 007: pool scores (phase 2).
--
-- The commish enters one number per player per game — the app stays the
-- ledger, no scoring engine. game_number lets one pool span a series
-- (NLCS) or a week (NFL). Leaderboard = sum of your picks' points.
--
-- Safe to re-run.

create table if not exists pool_scores (
  pool_id uuid not null references pools (id) on delete cascade,
  player_id uuid not null references pool_players (id) on delete cascade,
  game_number int not null default 1 check (game_number > 0),
  points int not null default 0 check (points >= 0),
  primary key (pool_id, player_id, game_number)
);

alter table pool_scores enable row level security;

-- Everyone in the group sees the scores (trash talk needs a leaderboard).
drop policy if exists "pool scores readable by members" on pool_scores;
create policy "pool scores readable by members" on pool_scores
  for select to authenticated using (
    is_group_member((select group_id from pools where pools.id = pool_scores.pool_id))
  );

-- Only the commish (pool creator) writes scores.
drop policy if exists "pool scores writable by commish" on pool_scores;
create policy "pool scores writable by commish" on pool_scores
  for all to authenticated
  using ((select created_by from pools where pools.id = pool_scores.pool_id) = auth.uid())
  with check ((select created_by from pools where pools.id = pool_scores.pool_id) = auth.uid());
