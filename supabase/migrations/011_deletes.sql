-- 011: hard deletes.
--
-- Pools: the commish can delete a pool outright (test pools, false
-- starts). Players, entries, picks, and stat lines cascade; any awarded
-- points vanish with it since the lifetime board is computed live.
-- Bets: creator or group admin can hard-delete (void stays the designed
-- lifecycle cancel). Updates and participants cascade.
-- Groups: a group admin can delete the whole group; bets, pools, and
-- memberships cascade.

drop policy if exists "pools deletable by commish" on pools;
create policy "pools deletable by commish" on pools
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "bets deletable by creator or admin" on bets;
create policy "bets deletable by creator or admin" on bets
  for delete to authenticated using (
    created_by = auth.uid() or is_group_admin(group_id)
  );

drop policy if exists "groups deletable by admin" on groups;
create policy "groups deletable by admin" on groups
  for delete to authenticated using (is_group_admin(id));
