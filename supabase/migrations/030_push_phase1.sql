-- 030: pool push, phase 1 (pick'em only).
--
-- Two pieces:
--
-- 1. push_events — the dedupe / sent-log for pool pushes. Pick'em
--    state is derived at read (a pool is "final" because its games are
--    final, "about to lock" because its first game starts soon), so
--    the 15-minute sync sweep would re-detect the same moment forever.
--    The sweep CLAIMS a row here before it sends — the primary key is
--    (kind, pool_id, user_id), so a given push can be claimed exactly
--    once per player per pool, and a second claim attempt inserts
--    nothing. That uniqueness is also the rate limit: one push per
--    kind per pool per person, ever — comfortably inside the "max 1
--    push per pool per day per person" rule.
--
--    kind: 'pool_open' | 'missing_picks' | 'pool_final'.
--    Rows are written ONLY by the service-role client (lib/pool-push.ts
--    and the createPickemPool action); RLS is on with no policies, so
--    the session client can neither read nor forge the log.
--
-- 2. Per-user push category prefs on profiles (where the profile
--    already lives): push_needs_you covers pushes that ask something
--    of the player (pool open, missing picks); push_results covers
--    "it's over" pushes (personalized pool result). Both default true,
--    so existing players get exactly the Phase 1 behavior until they
--    opt out on their Profile. Any missing/null value in older rows
--    reads as "on" in the app, same as the default.
--
-- Safe to re-run.

-- -------------------------------------------------------- push events
create table if not exists push_events (
  kind text not null check (kind in ('pool_open', 'missing_picks', 'pool_final')),
  pool_id uuid not null references pickem_pools (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (kind, pool_id, user_id)
);
create index if not exists push_events_pool_idx on push_events (pool_id);

alter table push_events enable row level security;
-- No policies on purpose: service-role only (it bypasses RLS).

-- ---------------------------------------------------- category prefs
alter table profiles
  add column if not exists push_needs_you boolean not null default true;
alter table profiles
  add column if not exists push_results boolean not null default true;
