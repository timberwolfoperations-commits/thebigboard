-- 029: pick'em seasons.
--
-- A season is the Poolr shape translated into Big Board's objects: ONE
-- season pool whose weeks are rounds, where each round IS an ordinary
-- weekly pick'em pool that already exists (pickem_pools). The season
-- rows here are pure linkage — no picks, winners, or points live in
-- these tables, and nothing about the weekly pools changes. Season
-- standings are derived at read from the round pools (per-round
-- leaderboards + pickem_pool_winners), exactly like everything else
-- on the site; a round "closes" when all of its games are final,
-- which is derived from the games table, never from a winners row.
--
-- The group stays the scoreboard: weekly co-winners keep banking
-- their 10 group points through pickem_pool_winners as they do today.
-- The season page is just the race view over rounds 1..N.
--
-- Safe to re-run.

-- ------------------------------------------------------------ seasons
create table if not exists pickem_seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  rounds_total int not null default 6 check (rounds_total >= 1),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists pickem_seasons_group_idx on pickem_seasons (group_id);

-- ------------------------------------------------------ season rounds
-- A pool belongs to at most one season (unique pool_id); a round slot
-- belongs to at most one pool (the PK). Round numbers are 1-based and
-- need not all be linked yet — unlinked rounds are simply upcoming.
create table if not exists pickem_season_rounds (
  season_id uuid not null references pickem_seasons (id) on delete cascade,
  pool_id uuid not null unique references pickem_pools (id) on delete cascade,
  round_no int not null check (round_no >= 1),
  primary key (season_id, round_no)
);

-- ------------------------------------------------------------------ RLS
-- Mirrors the pickem_pools pattern: group members read; writes belong
-- to the season creator or a group admin. Commissioner lockdown is a
-- server-action concern on top of this, not a policy concern.
alter table pickem_seasons enable row level security;
alter table pickem_season_rounds enable row level security;

drop policy if exists "pickem seasons readable" on pickem_seasons;
create policy "pickem seasons readable" on pickem_seasons
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "pickem seasons creator insert" on pickem_seasons;
create policy "pickem seasons creator insert" on pickem_seasons
  for insert to authenticated
  with check (created_by = auth.uid() and is_group_member(group_id));

drop policy if exists "pickem seasons creator update" on pickem_seasons;
create policy "pickem seasons creator update" on pickem_seasons
  for update to authenticated
  using (created_by = auth.uid() or is_group_admin(group_id));

drop policy if exists "pickem seasons creator delete" on pickem_seasons;
create policy "pickem seasons creator delete" on pickem_seasons
  for delete to authenticated
  using (created_by = auth.uid() or is_group_admin(group_id));

drop policy if exists "pickem season rounds readable" on pickem_season_rounds;
create policy "pickem season rounds readable" on pickem_season_rounds
  for select to authenticated
  using (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_rounds.season_id and is_group_member(s.group_id)
    )
  );

drop policy if exists "pickem season rounds creator write" on pickem_season_rounds;
create policy "pickem season rounds creator write" on pickem_season_rounds
  for all to authenticated
  using (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_rounds.season_id
        and (s.created_by = auth.uid() or is_group_admin(s.group_id))
    )
  )
  with check (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_rounds.season_id
        and (s.created_by = auth.uid() or is_group_admin(s.group_id))
    )
  );
