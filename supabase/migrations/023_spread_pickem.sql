-- 023: against-the-spread (ATS) pick'em.
--
-- ESPN's scoreboard already carries DraftKings odds for every NFL/CFB
-- game; the syncs now store the live line on games (spread = the HOME
-- team's number, negative when home is favored; over_under = the total).
-- Those lines move, so a pool never grades off the live number: when an
-- ATS pool is created, each game's current line is snapshotted onto the
-- pool's own link row (pickem_pool_games.spread) and grading reads only
-- the snapshot. use_spread defaults false, so every pool created before
-- this migration grades exactly as it always has — straight up.
--
-- Safe to re-run.

alter table games
  add column if not exists spread numeric,
  add column if not exists over_under numeric;

alter table pickem_pool_games
  add column if not exists spread numeric;

alter table pickem_pools
  add column if not exists use_spread boolean not null default false;
