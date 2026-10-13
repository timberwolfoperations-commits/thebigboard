-- 009: pool winner awards.
--
-- Pools never had a settle step — the leaderboard was the final word.
-- Now the commish can tap "award winner" on a locked pool and the champ
-- lands on the group's lifetime leaderboard, same as a bet win
-- (10 pts + 1 win, matching the bet default).
--
-- Also adds the missing commish-only UPDATE policy on pools, which
-- properly gates updatePool at the database layer.

alter table pools add column if not exists winner_user_id uuid references profiles (id);
alter table pools add column if not exists winner_points int not null default 10 check (winner_points >= 0);

drop policy if exists "pools updatable by commish" on pools;
create policy "pools updatable by commish" on pools
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
