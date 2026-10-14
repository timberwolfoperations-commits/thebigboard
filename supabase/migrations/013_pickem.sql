-- 013: pick'em pools (v1: standard weekly NFL pick'em).
--
-- Two pool types, not one uber-engine: roster pools pick players under a
-- cap; pick'em pools pick game winners. Both ride on the games table —
-- the API feeds games, pools link to them.
--
-- v1 ships only the 'standard' variant (1 pt per correct pick). The
-- variant column + scorer dispatch exist so elimination / race_50 / golf
-- plug in later without touching the standard path.
--
-- Safe to re-run.

-- ------------------------------------------------------ pick'em pools
create table if not exists pickem_pools (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  description text not null default '',
  variant text not null default 'standard'
    check (variant in ('standard', 'elimination', 'race_50', 'golf')),
  season int,
  week int,
  lock_at timestamptz not null,
  created_by uuid not null references profiles (id),
  winner_user_id uuid references profiles (id),
  winner_points int not null default 10,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------- pick'em pool games
create table if not exists pickem_pool_games (
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  primary key (pool_id, game_id)
);

-- ------------------------------------------------------- pick'em picks
create table if not exists pickem_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  picked_team text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, user_id, game_id)
);
create index if not exists pickem_picks_pool_idx on pickem_picks (pool_id);

-- ------------------------------------------------------------------ RLS
-- Mirrors the roster-pool pattern: group members read everything; users
-- touch only their own picks (lock enforced in the server action, not
-- just here); the commish (creator) owns the pool row.
alter table pickem_pools enable row level security;
alter table pickem_pool_games enable row level security;
alter table pickem_picks enable row level security;

drop policy if exists "pickem pools readable" on pickem_pools;
create policy "pickem pools readable" on pickem_pools
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "pickem pools creatable" on pickem_pools;
create policy "pickem pools creatable" on pickem_pools
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "pickem pools commish update" on pickem_pools;
create policy "pickem pools commish update" on pickem_pools
  for update to authenticated using (created_by = auth.uid());

drop policy if exists "pickem pools commish delete" on pickem_pools;
create policy "pickem pools commish delete" on pickem_pools
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "pickem pool games readable" on pickem_pool_games;
create policy "pickem pool games readable" on pickem_pool_games
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_pool_games.pool_id))
  );

drop policy if exists "pickem pool games linkable" on pickem_pool_games;
create policy "pickem pool games linkable" on pickem_pool_games
  for insert to authenticated
  with check (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_pool_games.pool_id))
  );

drop policy if exists "pickem picks readable" on pickem_picks;
create policy "pickem picks readable" on pickem_picks
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_picks.pool_id))
  );

drop policy if exists "pickem picks own insert" on pickem_picks;
create policy "pickem picks own insert" on pickem_picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_picks.pool_id))
  );

drop policy if exists "pickem picks own update" on pickem_picks;
create policy "pickem picks own update" on pickem_picks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pickem picks own delete" on pickem_picks;
create policy "pickem picks own delete" on pickem_picks
  for delete to authenticated using (user_id = auth.uid());
