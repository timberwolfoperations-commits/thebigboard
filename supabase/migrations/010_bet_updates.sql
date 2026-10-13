-- 010: bet updates — a simple shared log on each bet.
--
-- Not automated tracking: participants just post text (daily steps,
-- trash talk, whatever they're tracking). Group members can read
-- everything (the shit-talk rule); only participants can post.

create table if not exists bet_updates (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

alter table bet_updates enable row level security;

drop policy if exists "bet updates readable by members" on bet_updates;
create policy "bet updates readable by members" on bet_updates
  for select to authenticated using (
    is_group_member((select group_id from bets where bets.id = bet_updates.bet_id))
  );

drop policy if exists "bet updates postable by participants" on bet_updates;
create policy "bet updates postable by participants" on bet_updates
  for insert to authenticated with check (
    exists (
      select 1 from bet_participants
      where bet_participants.bet_id = bet_updates.bet_id
        and bet_participants.user_id = auth.uid()
    )
  );
