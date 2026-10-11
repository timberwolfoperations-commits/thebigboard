-- 005: roster pools (salary-cap player pools, any sport).
--
-- One flexible pool type: the commish defines a player pool with salaries,
-- everyone picks N players under a budget cap, most points wins. Tonight:
-- NLCS Series Showdown. Later: NFL dollar-limit weeks, anything else.
--
-- Phase 1 (tonight): pools + players + entries + picks. Scoring and
-- settlement land next (no scores exist until after Game 1 anyway).
--
-- Design notes:
--   - The app stays the ledger: the commish enters per-game points later;
--     no scoring engine, no per-sport logic. That's what makes one pool
--     type work for every sport.
--   - Lock is derived from lock_at at read time (like the deadbeat board
--     derives from settle_date) — no status-flip machinery.
--   - Entries are public to the group: it's a pool, not poker. Trash talk
--     requires knowing who took Ohtani.
--
-- Safe to re-run.

-- ------------------------------------------------------------------- pools
create table if not exists pools (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  budget int not null check (budget > 0),
  roster_size int not null check (roster_size > 0),
  lock_at timestamptz not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ pool players
create table if not exists pool_players (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools (id) on delete cascade,
  name text not null,
  team text not null default '',
  salary int not null check (salary >= 0)
);
create index if not exists pool_players_pool_idx on pool_players (pool_id);

-- ------------------------------------------------------------ pool entries
create table if not exists pool_entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pool_id, user_id)
);

-- ------------------------------------------------------------------ picks
create table if not exists pool_entry_picks (
  entry_id uuid not null references pool_entries (id) on delete cascade,
  player_id uuid not null references pool_players (id) on delete cascade,
  primary key (entry_id, player_id)
);

-- --------------------------------------------------------------------- RLS
alter table pools enable row level security;
alter table pool_players enable row level security;
alter table pool_entries enable row level security;
alter table pool_entry_picks enable row level security;

-- pools: members read everything in their group (same shit-talk rule as
-- bets). Any member can create one; updates gated by server actions.
drop policy if exists "pools readable by members" on pools;
create policy "pools readable by members" on pools
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "pools creatable by members" on pools;
create policy "pools creatable by members" on pools
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

-- pool_players: visible to group members; any member can add (commish
-- pastes the list; no reason to gate it tighter for v1).
drop policy if exists "pool players readable by members" on pool_players;
create policy "pool players readable by members" on pool_players
  for select to authenticated using (
    is_group_member((select group_id from pools where pools.id = pool_players.pool_id))
  );

drop policy if exists "pool players addable by members" on pool_players;
create policy "pool players addable by members" on pool_players
  for insert to authenticated with check (
    is_group_member((select group_id from pools where pools.id = pool_players.pool_id))
  );

-- pool_entries: visible to group members; you can only create/delete your
-- own entry (delete = "change my picks" before lock).
drop policy if exists "pool entries readable by members" on pool_entries;
create policy "pool entries readable by members" on pool_entries
  for select to authenticated using (
    is_group_member((select group_id from pools where pools.id = pool_entries.pool_id))
  );

drop policy if exists "pool entries creatable by self" on pool_entries;
create policy "pool entries creatable by self" on pool_entries
  for insert to authenticated with check (
    user_id = auth.uid()
    and is_group_member((select group_id from pools where pools.id = pool_entries.pool_id))
  );

drop policy if exists "pool entries deletable by self" on pool_entries;
create policy "pool entries deletable by self" on pool_entries
  for delete to authenticated using (user_id = auth.uid());

-- pool_entry_picks: visible to group members; you can only pick into your
-- own entry.
drop policy if exists "pool picks readable by members" on pool_entry_picks;
create policy "pool picks readable by members" on pool_entry_picks
  for select to authenticated using (
    is_group_member((
      select p.group_id from pools p
      join pool_entries e on e.pool_id = p.id
      where e.id = pool_entry_picks.entry_id
    ))
  );

drop policy if exists "pool picks insertable into own entry" on pool_entry_picks;
create policy "pool picks insertable into own entry" on pool_entry_picks
  for insert to authenticated with check (
    exists (
      select 1 from pool_entries e
      where e.id = pool_entry_picks.entry_id and e.user_id = auth.uid()
    )
  );
