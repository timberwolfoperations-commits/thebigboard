-- 033: Final 5 modifiers for the Thanksgiving Showdown.
--
-- - pool_entry_picks.modifier: which bonus rides on that pick — one of
--   DD (Double Down), PLUS5 (Add +5), SOLO (Solo Legend), WINNER
--   (Winner's Circle), WILD (Wildcard). Null for every pool that doesn't
--   use modifiers — legacy roster pools never set it and score exactly
--   as before. Showdown-style pools (players carry a game_number)
--   require all five, one per pick.
--
-- - game_scoring_plays: one row per scoring play per game, from the ESPN
--   summary endpoint (same fetch as the boxscore). Stored so the
--   Wildcard can be derived at scoring time: the 40+ yard TD comes from
--   the play text (yardage + scorer/passer), and the game-winning TD
--   from the score progression (away/home score after each play, in
--   order). All scoring plays are stored, not just TDs — a field goal
--   can tie the game, which is what breaks a "never relinquished" lead.
--
-- Writes to game_scoring_plays go through the service-role sync route
-- only — there are intentionally no public write policies on it.
-- The sync upsert is fail-soft: until this migration is run, the
-- table doesn't exist and the sync just skips the plays.
--
-- Safe to re-run.

alter table pool_entry_picks
  add column if not exists modifier text
  check (modifier is null or modifier in ('DD', 'PLUS5', 'SOLO', 'WINNER', 'WILD'));

-- ------------------------------------------------------- game scoring plays
create table if not exists game_scoring_plays (
  game_id uuid not null references games (id) on delete cascade,
  play_id text not null,
  seq int not null,
  team text not null default '',
  type_text text not null default '',
  play_text text not null default '',
  yardage int,
  scorer_name text,
  passer_name text,
  away_score int not null default 0,
  home_score int not null default 0,
  period int,
  clock_seconds numeric,
  primary key (game_id, play_id)
);
create index if not exists game_scoring_plays_game_idx on game_scoring_plays (game_id, seq);

-- --------------------------------------------------------------------- RLS
alter table game_scoring_plays enable row level security;

-- League-wide public data: any signed-in user can read (leaderboards need it).
drop policy if exists "game scoring plays readable" on game_scoring_plays;
create policy "game scoring plays readable" on game_scoring_plays
  for select to authenticated using (true);
