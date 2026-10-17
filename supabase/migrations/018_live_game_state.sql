-- 018: live game state for the dashboard scores view.
--
-- period/clock come from ESPN's game status (NFL/CFB: quarter + clock,
-- e.g. period 3, clock "4:32"). sync_state records the last successful
-- sync per sport so the UI can say "updated N min ago" honestly.

alter table games
  add column if not exists period integer,
  add column if not exists clock text;

create table if not exists sync_state (
  sport text primary key,
  synced_at timestamptz not null default now()
);
