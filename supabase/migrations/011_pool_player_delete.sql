-- 011: commish add/remove players pre-lock.
--
-- Lets the pool creator pull a player from the pool page. Inserts were
-- already open to group members; deletes are commish-only. The app
-- refuses the delete when anyone has already picked the player, because
-- pool_entry_picks and pool_stat_lines cascade on pool_players — a
-- silent shrink of someone's entry is worse than a refused remove.

drop policy if exists "pool players deletable by commish" on pool_players;
create policy "pool players deletable by commish" on pool_players
  for delete to authenticated
  using ((select created_by from pools where pools.id = pool_players.pool_id) = auth.uid());
