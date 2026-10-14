-- 012: NFL games table + API sync support.
--
-- Games are first-class: the ESPN sync fills the games table, pools link to
-- games via pool_games, and per-player stat lines live on the game in
-- game_stat_lines. Pool leaderboards sum API stats across a pool's linked
-- games through the pool's own scoring formula. pool_stat_lines (manual
-- commish entry) stays as the override path: a manual row for
-- (player, game number N) wins over the API line for the pool's Nth linked
-- game by kickoff order. Pools with no linked games score exactly as before.
--
-- Writes to games / game_stat_lines go through the service-role sync route
-- only — there are intentionally no public write policies on them.
--
-- Safe to re-run.

-- ------------------------------------------------------------------- games
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  sport text not null default 'NFL',
  label text not null,
  home_team text,
  away_team text,
  starts_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'final')),
  home_score int,
  away_score int,
  week int,
  season int,
  created_at timestamptz not null default now(),
  unique (sport, external_id)
);
create index if not exists games_sport_starts_idx on games (sport, starts_at);

-- -------------------------------------------------------------- pool games
-- Which games a pool scores off. Set once at pool creation from the slate
-- checklist; the commish can deselect Thursday/Monday games there.
create table if not exists pool_games (
  pool_id uuid not null references pools (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  primary key (pool_id, game_id)
);

-- --------------------------------------------------------- game stat lines
-- One row per player per game, from the ESPN boxscore. Keyed by
-- (game, player name, team abbrev); pool players match on the same pair.
create table if not exists game_stat_lines (
  game_id uuid not null references games (id) on delete cascade,
  player_name text not null,
  team text not null default '',
  stats jsonb not null default '{}'::jsonb,
  primary key (game_id, player_name, team)
);
create index if not exists game_stat_lines_game_idx on game_stat_lines (game_id);

-- --------------------------------------------------------------------- RLS
alter table games enable row level security;
alter table pool_games enable row level security;
alter table game_stat_lines enable row level security;

-- League-wide public data: any signed-in user can read (leaderboards need it).
drop policy if exists "games readable" on games;
create policy "games readable" on games
  for select to authenticated using (true);

drop policy if exists "game stat lines readable" on game_stat_lines;
create policy "game stat lines readable" on game_stat_lines
  for select to authenticated using (true);

drop policy if exists "pool games readable" on pool_games;
create policy "pool games readable" on pool_games
  for select to authenticated using (true);

-- The commish links games at pool creation (server action, as the user).
drop policy if exists "pool games linkable by members" on pool_games;
create policy "pool games linkable by members" on pool_games
  for insert to authenticated
  with check (is_group_member((select group_id from pools where pools.id = pool_games.pool_id)));
