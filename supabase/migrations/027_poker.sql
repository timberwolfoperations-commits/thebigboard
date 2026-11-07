-- 027: slow-play poker (see files/POKER-SPEC.md).
--
-- Tournament no-limit hold'em for a group, played a decision at a time:
-- a hand is dealt every ~2 days (Mon/Wed/Fri 9:00 AM ET by default), your
-- first decision of a hand gets 8 hours, every later one 4 hours, and a
-- timeout is an automatic check-or-fold. Everyone starts with 100 chips,
-- blinds escalate every 3 hands, last player standing banks 10 lifetime
-- points (poker_winners mirrors quiz_winners / pickem_pool_winners so
-- the lifetime board sums it the same way).
--
-- Secrecy model (the quiz pattern, migration 025): poker_hands.state is
-- the FULL engine state — every player's hole cards and the undealt
-- shoe — so poker_hands is DENY-ALL for client roles: RLS is on and
-- there is intentionally no policy of any kind on it. The only reads and
-- writes happen inside server code through the service-role client
-- (lib/poker/server.ts, driven by lib/poker-actions.ts and the
-- /api/poker/tick sweep), after the caller has been authenticated and
-- membership-checked. What a client may read directly is the public
-- surface: the table, its seats/stacks, and the action log — none of
-- which contain a card. (In practice the app reads even those through
-- server actions; the read policies exist so the tables follow the same
-- rules as the rest of the schema, not as a second data path.)
--
-- All writes to poker_seats / poker_actions / poker_winners are
-- service-role only (no client insert/update/delete policies): seating a
-- whole group, logging timeout actions on behalf of absent players, and
-- awarding the winner are server jobs, never client jobs.
--
-- Safe to re-run.

-- ------------------------------------------------------------ poker tables
create table if not exists poker_tables (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  name text not null,
  created_by uuid not null references profiles (id),
  status text not null default 'running'
    check (status in ('lobby', 'running', 'complete')),
  hand_no int not null default 0,
  next_deal_at timestamptz,
  winner_user_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists poker_tables_group_idx on poker_tables (group_id);

-- ------------------------------------------------------------- poker seats
-- One row per seated member. seat_no is the position order around the
-- table (0 = first seat) and never changes for the life of the table;
-- the engine's seat indexes are indexes into this order. stack is the
-- player's tournament chips BEHIND (not committed in the current hand —
-- mid-hand commitments live in the engine state); it is rewritten from
-- the engine result when a hand completes. status flips to 'busted'
-- when the stack reaches 0 at a hand boundary.
create table if not exists poker_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references poker_tables (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  seat_no int not null,
  stack int not null default 100 check (stack >= 0),
  status text not null default 'active' check (status in ('active', 'busted')),
  created_at timestamptz not null default now(),
  unique (table_id, user_id),
  unique (table_id, seat_no)
);
create index if not exists poker_seats_table_idx on poker_seats (table_id);

-- ------------------------------------------------------------- poker hands
-- One row per dealt hand. state is the serialized engine state (jsonb)
-- — SERVER-ONLY, see the secrecy note at the top. timeouts maps
-- user_id -> timeout count for THIS hand (the AWOL guard: at 3, the
-- sweep stops waiting on that player for the rest of the hand).
create table if not exists poker_hands (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references poker_tables (id) on delete cascade,
  hand_no int not null,
  state jsonb not null,
  status text not null default 'active' check (status in ('active', 'complete')),
  action_deadline_at timestamptz,
  timeouts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (table_id, hand_no)
);
create index if not exists poker_hands_table_idx on poker_hands (table_id);

-- ----------------------------------------------------------- poker actions
-- The immutable log of decisions in a hand — real ones and timeout
-- auto-actions (is_timeout) alike. This is what the hand-story UI reads.
-- It contains no cards, ever: an action is a verb, an amount, a street.
-- amount semantics: chips put in by a call; the raise-TO total for a
-- raise/all-in; null for check/fold.
create table if not exists poker_actions (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references poker_hands (id) on delete cascade,
  table_id uuid not null references poker_tables (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  seat_no int not null,
  street text not null,
  action text not null,
  amount int,
  is_timeout boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists poker_actions_hand_idx on poker_actions (hand_id);
create index if not exists poker_actions_table_idx on poker_actions (table_id);

-- ----------------------------------------------------------- poker winners
-- Same shape as quiz_winners (025) so the lifetime board sums it the
-- same way: one row per table, the last player standing, 10 pts.
create table if not exists poker_winners (
  table_id uuid primary key references poker_tables (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  points int not null default 10 check (points >= 0),
  awarded_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS
alter table poker_tables enable row level security;
alter table poker_seats enable row level security;
alter table poker_hands enable row level security;
alter table poker_actions enable row level security;
alter table poker_winners enable row level security;

-- poker_tables: members read; any member can create (creator = commish);
-- the creator updates/deletes. Mirrors the quizzes policies in 025.
drop policy if exists "poker tables readable" on poker_tables;
create policy "poker tables readable" on poker_tables
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "poker tables creatable" on poker_tables;
create policy "poker tables creatable" on poker_tables
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "poker tables commish update" on poker_tables;
create policy "poker tables commish update" on poker_tables
  for update to authenticated using (created_by = auth.uid());

drop policy if exists "poker tables commish delete" on poker_tables;
create policy "poker tables commish delete" on poker_tables
  for delete to authenticated using (created_by = auth.uid());

-- poker_seats: members of the table's group read (stacks are the
-- trash-talk surface). No client writes — seating is a server job.
drop policy if exists "poker seats readable" on poker_seats;
create policy "poker seats readable" on poker_seats
  for select to authenticated using (
    exists (
      select 1 from poker_tables t
      where t.id = poker_seats.table_id and is_group_member(t.group_id)
    )
  );

-- poker_hands: NO policies, on purpose. RLS is enabled and every client
-- role is denied every operation. The state column holds all hole cards
-- and the shoe; the service role (which bypasses RLS) is the only path,
-- inside server code that has already checked membership. Do not add a
-- select policy here — use the engine's publicView via server actions.

-- poker_actions: members read the log of tables in their groups. No
-- client writes — actions are recorded by server code (including
-- timeouts applied on behalf of players who never showed up).
drop policy if exists "poker actions readable" on poker_actions;
create policy "poker actions readable" on poker_actions
  for select to authenticated using (
    exists (
      select 1 from poker_tables t
      where t.id = poker_actions.table_id and is_group_member(t.group_id)
    )
  );

-- poker_winners: members read. No client insert — the award is made by
-- server code the moment a tournament ends.
drop policy if exists "poker winners readable" on poker_winners;
create policy "poker winners readable" on poker_winners
  for select to authenticated using (
    exists (
      select 1 from poker_tables t
      where t.id = poker_winners.table_id and is_group_member(t.group_id)
    )
  );
