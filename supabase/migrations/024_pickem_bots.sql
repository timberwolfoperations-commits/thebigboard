-- 024: bots for standard pick'em pools.
--
-- A bot is a POOL-SCOPED entrant, not a fake person: profiles.id carries
-- a foreign key to auth.users (migration 001), so a bot can never be a
-- profiles row without faking an auth account — and we don't fake auth
-- accounts. Instead the bot lives in pickem_bots (one row per pool) and
-- its picks in pickem_bot_picks, shaped like pickem_picks so the
-- leaderboard/reveal read paths can union them in.
--
-- Consequences by construction:
-- - Bots are never group_members, so group rosters and lifetime boards
--   (built from group_members + the winners tables) never see them.
-- - pickem_pool_winners.user_id references profiles, so a bot can never
--   be written as a winner even by accident; the award action also
--   filters bots out before choosing co-winners.
-- - Bot picks are written ONCE, by the commish, at add time (server
--   action), for games that haven't kicked off. No update policies
--   exist for either table: write-once, delete-by-commish only.
--
-- Safe to re-run.

-- ------------------------------------------------------------- bot rows
create table if not exists pickem_bots (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  name text not null,
  personality text not null check (personality in ('chalk', 'fader', 'coin_flip')),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
-- One bot identity per pool (case-insensitive — "Vegas Vic" twice is a
-- crowd, not a feature).
create unique index if not exists pickem_bots_pool_name_idx
  on pickem_bots (pool_id, lower(name));
create index if not exists pickem_bots_pool_idx on pickem_bots (pool_id);

-- ------------------------------------------------------------ bot picks
create table if not exists pickem_bot_picks (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references pickem_bots (id) on delete cascade,
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  picked_team text not null,
  created_at timestamptz not null default now(),
  unique (bot_id, game_id)
);
create index if not exists pickem_bot_picks_pool_idx on pickem_bot_picks (pool_id);

-- ------------------------------------------------------------------ RLS
-- Reads mirror pickem_pool_games: group members and joined guests of an
-- open pool can see the bots and their picks (leaderboards/reveals run
-- as the viewing user). Writes are the narrowest possible: only the
-- pool's creator (the commish) may insert or delete, and only bots they
-- created. No update policy on either table — bot picks never change.
alter table pickem_bots enable row level security;
alter table pickem_bot_picks enable row level security;

drop policy if exists "pickem bots readable" on pickem_bots;
create policy "pickem bots readable" on pickem_bots
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_bots.pool_id))
    or is_pool_guest('pickem', pickem_bots.pool_id)
  );

drop policy if exists "pickem bots commish insert" on pickem_bots;
create policy "pickem bots commish insert" on pickem_bots
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from pickem_pools p
      where p.id = pickem_bots.pool_id and p.created_by = auth.uid()
    )
  );

drop policy if exists "pickem bots commish delete" on pickem_bots;
create policy "pickem bots commish delete" on pickem_bots
  for delete to authenticated using (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_bots.pool_id and p.created_by = auth.uid()
    )
  );

drop policy if exists "pickem bot picks readable" on pickem_bot_picks;
create policy "pickem bot picks readable" on pickem_bot_picks
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_bot_picks.pool_id))
    or is_pool_guest('pickem', pickem_bot_picks.pool_id)
  );

drop policy if exists "pickem bot picks commish insert" on pickem_bot_picks;
create policy "pickem bot picks commish insert" on pickem_bot_picks
  for insert to authenticated
  with check (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_bot_picks.pool_id and p.created_by = auth.uid()
    )
  );

drop policy if exists "pickem bot picks commish delete" on pickem_bot_picks;
create policy "pickem bot picks commish delete" on pickem_bot_picks
  for delete to authenticated using (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_bot_picks.pool_id and p.created_by = auth.uid()
    )
  );
