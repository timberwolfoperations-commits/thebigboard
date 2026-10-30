-- Profile avatars: a preset animal mark shown next to a player's name on
-- leaderboards. The value is a key from the app's curated set
-- (components/avatar-art.tsx); null means "use my initials". Validated in
-- the app rather than by a check constraint so the set can grow without
-- another migration. Purely additive — no existing data changes.
alter table profiles add column if not exists avatar_animal text;
