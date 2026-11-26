-- 034: season champions.
--
-- A season banks group points when it ENDS: the champion(s) take
-- SEASON_WINNER_POINTS (10) each on the group lifetime board. The
-- season rows in migration 029 are pure linkage, so the winners live
-- here — one row per champion per season (PK season_id, user_id), so
-- re-awarding the same champion is a no-op and co-champions are just
-- two rows. lib/lifetime.ts reads this as a sixth lifetime source;
-- the weekly winners rows stay season-internal exactly as before
-- (they decide the champion on the season page, they never pay the
-- group board week to week).
--
-- Safe to re-run.

create table if not exists pickem_season_winners (
  season_id uuid not null references pickem_seasons (id) on delete cascade,
  user_id uuid not null references profiles (id),
  points int not null default 10 check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (season_id, user_id)
);
create index if not exists pickem_season_winners_season_idx on pickem_season_winners (season_id);

-- ------------------------------------------------------------------ RLS
-- Mirrors migration 029: group members read; writes belong to the
-- season creator or a group admin. The commissioner lockdown is a
-- server-action concern on top of this, not a policy concern.
alter table pickem_season_winners enable row level security;

drop policy if exists "pickem season winners readable" on pickem_season_winners;
create policy "pickem season winners readable" on pickem_season_winners
  for select to authenticated
  using (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_winners.season_id and is_group_member(s.group_id)
    )
  );

drop policy if exists "pickem season winners admin write" on pickem_season_winners;
create policy "pickem season winners admin write" on pickem_season_winners
  for all to authenticated
  using (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_winners.season_id
        and (s.created_by = auth.uid() or is_group_admin(s.group_id))
    )
  )
  with check (
    exists (
      select 1 from pickem_seasons s
      where s.id = pickem_season_winners.season_id
        and (s.created_by = auth.uid() or is_group_admin(s.group_id))
    )
  );
