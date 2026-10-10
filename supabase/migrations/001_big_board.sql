-- The Big Board — v1 schema
-- Run this once in the Supabase SQL editor.
--
-- Design in one paragraph:
--   Groups are the AUDIENCE (e.g. "HS friends" — everyone sees everything).
--   Bets live inside a group but have their OWN participant list, so you can
--   bet Danny and Adam without the whole group competing.
--   Points are a lifetime tally per group, never a currency: winners earn
--   them, nothing moves between people, nothing can be cashed out.
--
-- Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ groups
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles (id),
  invite_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- -------------------------------------------------------------------- bets
create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  title text not null,
  description text,
  points int not null default 10 check (points >= 0),
  created_by uuid not null references profiles (id),
  -- open: taking place. awaiting: past settle date, outcome proposed, collecting approvals.
  -- settled: done, points awarded. disputed: someone objected, needs admin. void: cancelled.
  status text not null default 'open'
    check (status in ('open', 'awaiting', 'settled', 'disputed', 'void')),
  settle_date date not null,
  proposed_winner_id uuid references profiles (id),
  proposed_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists bet_participants (
  bet_id uuid not null references bets (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  approved boolean not null default false,
  primary key (bet_id, user_id)
);

-- ------------------------------------------------------- membership helpers
-- These run as SECURITY DEFINER (as the database owner) so they can check
-- membership WITHOUT tripping Row Level Security. This is the fix for the
-- "infinite recursion" bug class: policies must never query a table whose
-- own policy queries back. All membership checks funnel through here.
create or replace function is_group_member(gid uuid)
returns boolean
language sql security definer set search_path = public
stable as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function is_group_admin(gid uuid)
returns boolean
language sql security definer set search_path = public
stable as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_bet_participant(bid uuid)
returns boolean
language sql security definer set search_path = public
stable as $$
  select exists (
    select 1 from bet_participants
    where bet_id = bid and user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------- bootstrap actions
-- Creating and joining groups are the two moments a user is NOT yet a member,
-- so plain RLS can't authorize them. These functions do it safely instead.
-- NOTE: OUT parameter names are part of the return type, so CREATE OR REPLACE
-- cannot rename them — drop first.
drop function if exists create_group(text);
create or replace function create_group(p_name text)
returns table (new_group_id uuid, new_invite_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Group name required'; end if;

  -- Make sure the caller has a profile row (covers accounts created before
  -- the auto-profile trigger existed).
  insert into profiles (id) values (auth.uid()) on conflict (id) do nothing;

  -- 12 URL-safe characters, e.g. "aB3_dEf9Gh1j"
  v_token := translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');

  insert into groups (name, created_by, invite_token)
  values (trim(p_name), auth.uid(), v_token)
  returning groups.id into v_id;

  insert into group_members (group_id, user_id, role)
  values (v_id, auth.uid(), 'admin');

  return query select v_id, v_token;
end $$;

create or replace function join_group_by_token(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select g.id into v_id from groups g where g.invite_token = p_token;
  if v_id is null then raise exception 'Invalid invite link'; end if;

  insert into profiles (id) values (auth.uid()) on conflict (id) do nothing;

  insert into group_members (group_id, user_id, role)
  values (v_id, auth.uid(), 'member')
  on conflict do nothing;

  return v_id;
end $$;

-- Safe peek at a group from an invite link (name only — no member list leak).
create or replace function get_group_by_token(p_token text)
returns table (id uuid, name text, member_count bigint)
language sql security definer set search_path = public
stable as $$
  select g.id, g.name, count(m.user_id)
  from groups g
  left join group_members m on m.group_id = g.id
  where g.invite_token = p_token
  group by g.id, g.name;
$$;

create or replace function remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group_id) then raise exception 'Admins only'; end if;
  delete from group_members
  where group_id = p_group_id and user_id = p_user_id;
end $$;

create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from group_members
  where group_id = p_group_id and user_id = auth.uid();
end $$;

-- ------------------------------------------------------------ auto-profile
-- Every new auth user gets a profile row. Display name comes from Google.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: anyone who signed up before the trigger above existed gets a
-- profile row now (prevents foreign-key failures on group/bet creation).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- --------------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table bets enable row level security;
alter table bet_participants enable row level security;

-- profiles: everyone signed in can see names (leaderboards need them);
-- you can only edit your own.
drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles
  for select to authenticated using (true);

drop policy if exists "profiles self-update" on profiles;
create policy "profiles self-update" on profiles
  for update to authenticated using (id = auth.uid());

-- groups: members can read their groups. Creation goes through create_group().
drop policy if exists "groups readable by members" on groups;
create policy "groups readable by members" on groups
  for select to authenticated using (is_group_member(id));

-- group_members: members can see the roster. Adds/removes go through the
-- functions above (join_group_by_token / remove_group_member / leave_group).
drop policy if exists "members readable by members" on group_members;
create policy "members readable by members" on group_members
  for select to authenticated using (is_group_member(group_id));

-- bets: members read everything in their group (the whole group sees every
-- bet — that's the shit-talk requirement). Any member can create a bet;
-- updates are gated by the server actions, which run as the user.
drop policy if exists "bets readable by members" on bets;
create policy "bets readable by members" on bets
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "bets creatable by members" on bets;
create policy "bets creatable by members" on bets
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "bets updatable by members" on bets;
create policy "bets updatable by members" on bets
  for update to authenticated using (is_group_member(group_id));

-- bet_participants: visible to group members; a participant can only flip
-- their OWN approval switch; rows are created/deleted with the bet by admins.
drop policy if exists "participants readable by members" on bet_participants;
create policy "participants readable by members" on bet_participants
  for select to authenticated using (
    is_group_member((select group_id from bets where bets.id = bet_participants.bet_id))
  );

drop policy if exists "participants creatable by members" on bet_participants;
create policy "participants creatable by members" on bet_participants
  for insert to authenticated with check (
    is_group_member((select group_id from bets where bets.id = bet_participants.bet_id))
  );

-- bet_participants: visible to group members. Any participant can flip approval
-- switches within their bet (proposing an outcome resets everyone's switch,
-- which is why this is broader than "own row only"). Row creation/deletion
-- happens with the bet or by admins.
drop policy if exists "participants manageable by participants" on bet_participants;
create policy "participants manageable by participants" on bet_participants
  for update to authenticated
  using (is_bet_participant(bet_id));

drop policy if exists "participants removable by admins" on bet_participants;
create policy "participants removable by admins" on bet_participants
  for delete to authenticated using (
    is_group_admin((select group_id from bets where bets.id = bet_participants.bet_id))
  );
