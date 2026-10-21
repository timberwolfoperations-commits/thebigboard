-- 021: survivor pools.
-- One entry per person (v1). Pick one team per week; win and advance,
-- lose (or no pick) and you're out. No team twice. Elimination is DERIVED
-- from the games table at read time (lib/survivor.ts) — nothing here
-- stores who's out, so a score correction can never strand bad state.
create table if not exists survivor_pools (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  season int not null,
  start_week int not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists survivor_pools_group_idx on survivor_pools (group_id);

create table if not exists survivor_entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references survivor_pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pool_id, user_id)
);
create index if not exists survivor_entries_pool_idx on survivor_entries (pool_id);

create table if not exists survivor_picks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references survivor_entries (id) on delete cascade,
  week int not null,
  game_id uuid not null references games (id),
  picked_team text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, week)
);
create index if not exists survivor_picks_entry_idx on survivor_picks (entry_id);

alter table survivor_pools enable row level security;
alter table survivor_entries enable row level security;
alter table survivor_picks enable row level security;

drop policy if exists "survivor pools readable" on survivor_pools;
create policy "survivor pools readable" on survivor_pools
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "survivor pools creatable" on survivor_pools;
create policy "survivor pools creatable" on survivor_pools
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "survivor pools commish delete" on survivor_pools;
create policy "survivor pools commish delete" on survivor_pools
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "survivor entries readable" on survivor_entries;
create policy "survivor entries readable" on survivor_entries
  for select to authenticated
  using (
    exists (
      select 1 from survivor_pools p
      where p.id = survivor_entries.pool_id and is_group_member(p.group_id)
    )
  );

drop policy if exists "survivor entries own insert" on survivor_entries;
create policy "survivor entries own insert" on survivor_entries
  for insert to authenticated
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from survivor_pools p
      where p.id = survivor_entries.pool_id and is_group_member(p.group_id)
    )
  );

-- Picks are readable by group members: after a game kicks off the page
-- reveals them; before that it only reveals your own (enforced in the UI
-- and actions — same trust model as pick'em's public picks).
drop policy if exists "survivor picks readable" on survivor_picks;
create policy "survivor picks readable" on survivor_picks
  for select to authenticated
  using (
    exists (
      select 1 from survivor_entries e
      join survivor_pools p on p.id = e.pool_id
      where e.id = survivor_picks.entry_id and is_group_member(p.group_id)
    )
  );

drop policy if exists "survivor picks own write" on survivor_picks;
create policy "survivor picks own write" on survivor_picks
  for insert to authenticated
  with check (
    exists (
      select 1 from survivor_entries e
      where e.id = survivor_picks.entry_id and e.user_id = auth.uid()
    )
  );

drop policy if exists "survivor picks own update" on survivor_picks;
create policy "survivor picks own update" on survivor_picks
  for update to authenticated
  using (
    exists (
      select 1 from survivor_entries e
      where e.id = survivor_picks.entry_id and e.user_id = auth.uid()
    )
  );
