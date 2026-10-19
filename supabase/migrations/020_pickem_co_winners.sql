-- 020: co-winners for pick'em pools.
-- A tied top score crowns every tied entrant (10 pts each on the lifetime
-- board) instead of breaking the tie on earliest picks. The legacy
-- pickem_pools.winner_user_id / winner_points columns stay written with the
-- first co-winner so existing reads keep working; the lifetime board and
-- pool page read this table.
create table if not exists pickem_pool_winners (
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  points int not null default 10 check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

-- Backfill pools already awarded under the single-winner scheme.
insert into pickem_pool_winners (pool_id, user_id, points)
select id, winner_user_id, winner_points
from pickem_pools
where winner_user_id is not null
on conflict do nothing;

alter table pickem_pool_winners enable row level security;

drop policy if exists "pickem pool winners readable" on pickem_pool_winners;
create policy "pickem pool winners readable" on pickem_pool_winners
  for select to authenticated
  using (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_pool_winners.pool_id and is_group_member(p.group_id)
    )
  );

drop policy if exists "pickem pool winners commish insert" on pickem_pool_winners;
create policy "pickem pool winners commish insert" on pickem_pool_winners
  for insert to authenticated
  with check (
    exists (
      select 1 from pickem_pools p
      where p.id = pickem_pool_winners.pool_id and p.created_by = auth.uid()
    )
  );
