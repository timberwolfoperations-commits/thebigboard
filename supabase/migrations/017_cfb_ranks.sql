-- 017: AP ranks on the games table (college football).
--
-- Populated by the CFB sync from ESPN's curatedRank (null when unranked).
-- Rendered into game labels so pick'em cards and slates show "#4 Ohio State".

alter table games
  add column if not exists home_rank integer,
  add column if not exists away_rank integer;
