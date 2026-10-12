-- 008: stat-based scoring (replaces manual points).
--
-- The commish enters raw stats per player per game; the app applies the
-- pool's scoring formula. The formula is DATA (jsonb on pools), not code —
-- that's what keeps one pool type working for every sport. A "PTS" stat
-- with weight 1 is the escape hatch for direct points entry.
--
-- pool_scores never held real data (007 went out hours ago), so it's
-- dropped in favor of pool_stat_lines.

drop table if exists pool_scores;

create table if not exists pool_stat_lines (
  pool_id uuid not null references pools (id) on delete cascade,
  player_id uuid not null references pool_players (id) on delete cascade,
  game_number int not null default 1 check (game_number > 0),
  stats jsonb not null default '{}'::jsonb,
  primary key (pool_id, player_id, game_number)
);

alter table pool_stat_lines enable row level security;

-- Everyone in the group sees the stat lines (leaderboard needs them).
drop policy if exists "pool stat lines readable by members" on pool_stat_lines;
create policy "pool stat lines readable by members" on pool_stat_lines
  for select to authenticated using (
    is_group_member((select group_id from pools where pools.id = pool_stat_lines.pool_id))
  );

-- Only the commish (pool creator) writes them.
drop policy if exists "pool stat lines writable by commish" on pool_stat_lines;
create policy "pool stat lines writable by commish" on pool_stat_lines
  for all to authenticated
  using ((select created_by from pools where pools.id = pool_stat_lines.pool_id) = auth.uid())
  with check ((select created_by from pools where pools.id = pool_stat_lines.pool_id) = auth.uid());

-- The formula: {"HR": 4, "K": 1, ...} — points per unit of each stat.
alter table pools add column if not exists scoring_formula jsonb;
