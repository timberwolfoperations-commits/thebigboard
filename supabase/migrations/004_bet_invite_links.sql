-- 004: bet invite links.
--
-- Text someone a bet link: they tap it and see THE BET first — title,
-- terms, who's in — with a single "Accept the bet" button. Accepting joins
-- them to the group and the bet in one atomic step. No account yet? They
-- sign in first, then land right back here.
--
-- The bet still only goes live once 2+ participants have all accepted.
--
-- Safe to re-run.

alter table bets add column if not exists invite_token text;

-- Backfill tokens for existing bets.
update bets
  set invite_token = translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_')
  where invite_token is null;

alter table bets alter column invite_token set not null;
create unique index if not exists bets_invite_token_uidx on bets (invite_token);

-- Same as 002, plus: going live requires 2+ participants, all accepted.
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

    select count(*) into v_remaining from bet_participants where bet_id = p_bet_id;
    select count(*) into v_unaccepted from bet_participants
      where bet_id = p_bet_id and accepted = false;
    if v_unaccepted = 0 and v_remaining >= 2 then
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

-- Accept a bet invite in one step: joins the group, joins the bet as an
-- accepted participant, and flips the bet live if everyone's now in.
create or replace function accept_bet_invite(p_token text)
returns table (new_group_id uuid, new_bet_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_bet_id uuid;
  v_group_id uuid;
  v_status text;
  v_remaining int;
  v_unaccepted int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select b.id, b.group_id, b.status into v_bet_id, v_group_id, v_status
    from bets b where b.invite_token = p_token;
  if v_bet_id is null then raise exception 'Invalid invite link'; end if;
  if v_status not in ('pending', 'open') then
    raise exception 'This bet is no longer open for invites';
  end if;

  insert into profiles (id) values (auth.uid()) on conflict (id) do nothing;

  insert into group_members (group_id, user_id, role)
    values (v_group_id, auth.uid(), 'member')
    on conflict do nothing;

  insert into bet_participants (bet_id, user_id, accepted)
    values (v_bet_id, auth.uid(), true)
    on conflict (bet_id, user_id) do update set accepted = true;

  select count(*) into v_remaining from bet_participants where bet_id = v_bet_id;
  select count(*) into v_unaccepted from bet_participants
    where bet_id = v_bet_id and accepted = false;
  if v_unaccepted = 0 and v_remaining >= 2 then
    update bets set status = 'open' where id = v_bet_id;
  end if;

  return query select v_group_id, v_bet_id;
end $$;

-- Safe peek at a bet from an invite link (no roster leak).
create or replace function get_bet_by_token(p_token text)
returns table (
  bet_id uuid, group_id uuid, bet_title text, bet_description text,
  bet_points int, group_name text, participant_count bigint
)
language sql security definer set search_path = public
stable as $$
  select b.id, b.group_id, b.title, b.description, b.points, g.name, count(p.user_id)
  from bets b
  join groups g on g.id = b.group_id
  left join bet_participants p on p.bet_id = b.id
  where b.invite_token = p_token
  group by b.id, b.group_id, b.title, b.description, b.points, g.name;
$$;
