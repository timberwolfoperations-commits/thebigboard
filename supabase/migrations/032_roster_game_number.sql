-- 032: Roster pools get a game slot (Thanksgiving Showdown standard).
--
-- - pool_players.game_number: which slate game the player is in (1–5 in
--   kickoff order for the showdown). Null for every other pool — legacy
--   pools never set it, and submitEntry only enforces one-pick-per-game
--   when a picked player has one. The column is nullable on purpose, so
--   existing pools keep working exactly as before.
--
-- Safe to re-run.

alter table pool_players
  add column if not exists game_number int check (game_number between 1 and 5);
