-- 022: open (public) pools.
--
-- A commish can flag a pick'em or survivor pool is_public. Any signed-in
-- user then sees it in the "Open pools" discovery sections (Home feed +
-- Pools tab); joining inserts a pool_guests row. A guest plays THAT pool —
-- picks, entries, its leaderboard — and nothing else: no group membership,
-- no group page, no group lifetime board (the board is built from
-- group_members, so guests never land on it).
--
-- Access model: the pools' readable policies gain "or is_public" (that's
-- the discovery surface), and every pool-scoped policy gains
-- "or is_pool_guest(...)" so a joined guest gets exactly the reads/writes
-- a member gets, for that one pool. Member paths are untouched.
--
-- Safe to re-run.

-- ------------------------------------------------------------ public flag
alter table pickem_pools
  add column if not exists is_public boolean not null default false;
alter table survivor_pools
  add column if not exists is_public boolean not null default false;

-- ------------------------------------------------------------ guest table
create table if not exists pool_guests (
  id uuid primary key default gen_random_uuid(),
  pool_type text not null check (pool_type in ('pickem', 'survivor')),
  pool_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pool_type, pool_id, user_id)
);
create index if not exists pool_guests_user_idx on pool_guests (user_id);
create index if not exists pool_guests_pool_idx on pool_guests (pool_type, pool_id);

-- Guest helper, mirroring is_group_member: security definer so policies
-- can consult pool_guests without recursing through its own RLS.
create or replace function is_pool_guest(ptype text, pid uuid)
returns boolean
language sql security definer set search_path = public
stable as $$
  select exists (
    select 1 from pool_guests
    where pool_type = ptype and pool_id = pid and user_id = auth.uid()
  );
$$;

alter table pool_guests enable row level security;

-- Your own guest rows are yours to read.
drop policy if exists "pool guests own read" on pool_guests;
create policy "pool guests own read" on pool_guests
  for select to authenticated using (user_id = auth.uid());

-- Members of the hosting group can read the guest list for pools in their
-- group (leaderboards / who's-in counts).
drop policy if exists "pool guests host read" on pool_guests;
create policy "pool guests host read" on pool_guests
  for select to authenticated using (
    (pool_type = 'pickem' and exists (
      select 1 from pickem_pools p
      where p.id = pool_guests.pool_id and is_group_member(p.group_id)
    ))
    or (pool_type = 'survivor' and exists (
      select 1 from survivor_pools p
      where p.id = pool_guests.pool_id and is_group_member(p.group_id)
    ))
  );

-- Joining = inserting your own row, and only against a pool that is
-- actually flagged public. The subqueries lean on the pools' own RLS: a
-- private pool's row is invisible to a non-member (check fails), and a
-- member looking at a private pool sees is_public = false (check fails).
drop policy if exists "pool guests own join" on pool_guests;
create policy "pool guests own join" on pool_guests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (pool_type = 'pickem' and exists (
        select 1 from pickem_pools p
        where p.id = pool_guests.pool_id and p.is_public
      ))
      or (pool_type = 'survivor' and exists (
        select 1 from survivor_pools p
        where p.id = pool_guests.pool_id and p.is_public
      ))
    )
  );

-- ------------------------------------------------------- pick'em access
drop policy if exists "pickem pools readable" on pickem_pools;
create policy "pickem pools readable" on pickem_pools
  for select to authenticated using (is_group_member(group_id) or is_public);

drop policy if exists "pickem pool games readable" on pickem_pool_games;
create policy "pickem pool games readable" on pickem_pool_games
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_pool_games.pool_id))
    or is_pool_guest('pickem', pickem_pool_games.pool_id)
  );

drop policy if exists "pickem picks readable" on pickem_picks;
create policy "pickem picks readable" on pickem_picks
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_picks.pool_id))
    or is_pool_guest('pickem', pickem_picks.pool_id)
  );

drop policy if exists "pickem picks own insert" on pickem_picks;
create policy "pickem picks own insert" on pickem_picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_picks.pool_id))
      or is_pool_guest('pickem', pickem_picks.pool_id)
    )
  );

drop policy if exists "pickem lines readable" on pickem_lines;
create policy "pickem lines readable" on pickem_lines
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_lines.pool_id))
    or is_pool_guest('pickem', pickem_lines.pool_id)
  );

drop policy if exists "pickem prop picks readable" on pickem_prop_picks;
create policy "pickem prop picks readable" on pickem_prop_picks
  for select to authenticated using (
    is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_prop_picks.pool_id))
    or is_pool_guest('pickem', pickem_prop_picks.pool_id)
  );

drop policy if exists "pickem prop picks own insert" on pickem_prop_picks;
create policy "pickem prop picks own insert" on pickem_prop_picks
  for insert to authenticated with check (
    user_id = auth.uid()
    and (
      is_group_member((select group_id from pickem_pools where pickem_pools.id = pickem_prop_picks.pool_id))
      or is_pool_guest('pickem', pickem_prop_picks.pool_id)
    )
  );

drop policy if exists "pickem pool winners readable" on pickem_pool_winners;
create policy "pickem pool winners readable" on pickem_pool_winners
  for select to authenticated
  using (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_pool_winners.pool_id
        and (is_group_member(p.group_id) or is_pool_guest('pickem', p.id))
    )
  );

-- ------------------------------------------------------- survivor access
drop policy if exists "survivor pools readable" on survivor_pools;
create policy "survivor pools readable" on survivor_pools
  for select to authenticated using (is_group_member(group_id) or is_public);

drop policy if exists "survivor entries readable" on survivor_entries;
create policy "survivor entries readable" on survivor_entries
  for select to authenticated
  using (
    exists (
      select 1 from survivor_pools p
      where p.id = survivor_entries.pool_id
        and (is_group_member(p.group_id) or is_pool_guest('survivor', p.id))
    )
  );

drop policy if exists "survivor entries own insert" on survivor_entries;
create policy "survivor entries own insert" on survivor_entries
  for insert to authenticated
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from survivor_pools p
      where p.id = survivor_entries.pool_id
        and (is_group_member(p.group_id) or is_pool_guest('survivor', p.id))
    )
  );

drop policy if exists "survivor picks readable" on survivor_picks;
create policy "survivor picks readable" on survivor_picks
  for select to authenticated
  using (
    exists (
      select 1 from survivor_entries e
      join survivor_pools p on p.id = e.pool_id
      where e.id = survivor_picks.entry_id
        and (is_group_member(p.group_id) or is_pool_guest('survivor', p.id))
    )
  );

-- ------------------------------------------------- host names for cards
-- Discovery cards show the host group's name, but the groups row itself
-- stays members-only (it carries the invite token). This view exposes
-- ONLY (pool -> group name) for pools flagged public, nothing else.
create or replace view open_pool_hosts as
  select 'pickem'::text as pool_type, p.id as pool_id, p.group_id as group_id,
         g.name as group_name
  from pickem_pools p
  join groups g on g.id = p.group_id
  where p.is_public
  union all
  select 'survivor'::text as pool_type, p.id as pool_id, p.group_id as group_id,
         g.name as group_name
  from survivor_pools p
  join groups g on g.id = p.group_id
  where p.is_public;

grant select on open_pool_hosts to authenticated;
