-- 016: college football top-25 flag on the games table.
--
-- The CFB sync marks games involving at least one AP Top 25 team
-- (ESPN's curatedRank <= 25; unranked teams report 99). Pool creation
-- filters the CFB slate to flagged games.

alter table games
  add column if not exists is_top25 boolean not null default false;
