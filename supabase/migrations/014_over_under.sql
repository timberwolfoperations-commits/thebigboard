-- 014: over/under pick'em variant (PrizePicks-style player props).
--
-- The commish sets lines per (player, stat) — e.g. Ohtani HR 1.5, Snell K
-- 6.5 — friends pick over or under, and the scores feed auto-grades.
-- Actuals come from game_stat_lines across the pool's linked games, so no
-- new sync work: the stat_key must match a game_stat_lines key exactly.
--
-- v1: commish-managed lines (replace-on-save), 1 pt per correct side,
-- push (actual == line) scores for nobody. A prop is decided only when
-- every linked game is final.
--
-- Safe to re-run.

-- ------------------------------------------------- variant check update
alter table pickem_pools drop constraint if exists pickem_pools_variant_check;
alter table pickem_pools add constraint pickem_pools_variant_check
  check (variant in ('standard', 'elimination', 'race_50', 'golf', 'over_under'));

-- -------------------------------------------------------- prop lines
-- One row per prop the commish offers. No unique constraint beyond id:
-- two props on the same player+stat (different lines) are allowed.
create table if not exists pickem_lines (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  player_name text not null,
  team text not null default '',
  stat_key text not null,
  line numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists pickem_lines_pool_idx on pickem_lines (pool_id);

-- -------------------------------------------------------- prop picks
create table if not exists pickem_prop_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  line_id uuid not null references pickem_lines (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  side text not null check (side in ('over', 'under')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, user_id, line_id)
);
create index if not exists pickem_prop_picks_pool_idx on pickem_prop_picks (pool_id);

-- ------------------------------------------------------------------ RLS
-- Same shape as the pickem tables: group members read everything, the
-- commish (pool creator) manages lines, users touch only their own picks.
alter table pickem_lines enable row level security;
alter table pickem_prop_picks enable row level security;

drop policy if exists "pickem lines readable" on pickem_lines;
create policy "pickem lines readable" on pickem_lines
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_lines.pool_id))
  );

drop policy if exists "pickem lines commish insert" on pickem_lines;
create policy "pickem lines commish insert" on pickem_lines
  for insert to authenticated with check (
    (select created_by from pickem_pools where pickem_pools.id = pickem_lines.pool_id) = auth.uid()
  );

drop policy if exists "pickem lines commish update" on pickem_lines;
create policy "pickem lines commish update" on pickem_lines
  for update to authenticated
  using (
    (select created_by from pickem_pools where pickem_pools.id = pickem_lines.pool_id) = auth.uid()
  )
  with check (
    (select created_by from pickem_pools where pickem_pools.id = pickem_lines.pool_id) = auth.uid()
  );

drop policy if exists "pickem lines commish delete" on pickem_lines;
create policy "pickem lines commish delete" on pickem_lines
  for delete to authenticated using (
    (select created_by from pickem_pools where pickem_pools.id = pickem_lines.pool_id) = auth.uid()
  );

drop policy if exists "pickem prop picks readable" on pickem_prop_picks;
create policy "pickem prop picks readable" on pickem_prop_picks
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_prop_picks.pool_id))
  );

drop policy if exists "pickem prop picks own insert" on pickem_prop_picks;
create policy "pickem prop picks own insert" on pickem_prop_picks
  for insert to authenticated with check (
    user_id = auth.uid()
    and is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_prop_picks.pool_id))
  );

drop policy if exists "pickem prop picks own update" on pickem_prop_picks;
create policy "pickem prop picks own update" on pickem_prop_picks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pickem prop picks own delete" on pickem_prop_picks;
create policy "pickem prop picks own delete" on pickem_prop_picks
  for delete to authenticated using (user_id = auth.uid());
