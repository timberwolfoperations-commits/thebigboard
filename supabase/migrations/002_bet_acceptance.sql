-- 002: bet acceptance. Nobody gets conscripted into a bet.
--
-- New bets start "pending". Each participant accepts (or declines) the invite.
-- The bet goes live ("open") once everyone has accepted. Declining removes
-- you; the bet is voided if fewer than 2 participants remain.
--
-- Safe to re-run.

alter table bet_participants
  add column if not exists accepted boolean not null default false;

-- Everyone already in a bet agreed under the old rules — grandfather them in.
update bet_participants set accepted = true where accepted = false;

-- One atomic step: accept or decline a pending bet invite.
create or replace function respond_to_bet(p_bet_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_remaining int;
  v_unaccepted int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status into v_status from bets where id = p_bet_id;
  if v_status is null then raise exception 'Bet not found'; end if;
  if v_status != 'pending' then raise exception 'This bet is already live'; end if;

  if not exists (
    select 1 from bet_participants
    where bet_id = p_bet_id and user_id = auth.uid()
  ) then raise exception 'You are not in this bet'; end if;

  if p_accept then
    update bet_participants set accepted = true
      where bet_id = p_bet_id and user_id = auth.uid();

    select count(*) into v_unaccepted from bet_participants
      where bet_id = p_bet_id and accepted = false;
    if v_unaccepted = 0 then
      update bets set status = 'open' where id = p_bet_id;
    end if;
  else
    delete from bet_participants
      where bet_id = p_bet_id and user_id = auth.uid();

    select count(*) into v_remaining from bet_participants where bet_id = p_bet_id;
    if v_remaining < 2 then
      update bets set status = 'void' where id = p_bet_id;
    end if;
  end if;
end $$;
