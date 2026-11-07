-- 028: web-push subscriptions (notifications v1).
--
-- One row per browser/device subscription a player has turned on from
-- their profile. The client writes its OWN rows through the session
-- client (owner-only RLS below — the toggle in components/push-toggle
-- upserts the subscription its browser just created); the SENDS run on
-- the service-role client in lib/notify.ts, which reads every
-- subscription a user has and prunes the dead ones (push services
-- answer 404/410 for endpoints that are gone — those rows are deleted
-- at send time, never by the client).
--
-- Everything about push is keyed on VAPID env vars the app may not
-- have yet (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
-- VAPID_SUBJECT): with them unset the whole feature no-ops, so this
-- table can sit empty indefinitely. Endpoint + keys are per-device
-- credentials for a notification channel, not secrets about the user —
-- but they're still owner-only: nobody reads anyone else's endpoints.
--
-- Safe to re-run.

-- -------------------------------------------------- push subscriptions
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- ------------------------------------------------------------------ RLS
alter table push_subscriptions enable row level security;

drop policy if exists "push subscriptions readable" on push_subscriptions;
create policy "push subscriptions readable" on push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push subscriptions insertable" on push_subscriptions;
create policy "push subscriptions insertable" on push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push subscriptions updatable" on push_subscriptions;
create policy "push subscriptions updatable" on push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push subscriptions deletable" on push_subscriptions;
create policy "push subscriptions deletable" on push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
