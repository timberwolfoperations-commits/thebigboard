-- Seed: Test of Manhood — Season 1 (the LIVE SWITCH, 2026-11-09).
--
-- Run AFTER migration 029, in the Supabase SQL editor. This creates
-- the season shell and links the four existing weekly pick'em pools
-- (NFL Weeks 6-9) as Rounds 1-4. It moves NO data: no picks, winners,
-- or points are touched — the season page derives everything from
-- those pools at read.
--
-- Everything resolves by name/week, never by hard-coded UUIDs, and
-- every statement is idempotent — safe to re-run.

-- ------------------------------------------------------- the season
-- created_by = the group's creator, matching who set the group up.
insert into pickem_seasons (group_id, name, rounds_total, created_by)
select g.id, 'Test of Manhood', 6, g.created_by
from groups g
where g.name ilike '%test of manhood%'
  and not exists (
    select 1 from pickem_seasons s
    where s.group_id = g.id and s.name = 'Test of Manhood'
  )
order by g.created_at
limit 1;

-- --------------------------------------------------- rounds 1-4 link
-- Weeks 6/7/8/9 -> Rounds 1/2/3/4. Standard pools only; on conflict
-- (already linked) do nothing.
insert into pickem_season_rounds (season_id, pool_id, round_no)
select s.id, p.id,
  case p.week when 6 then 1 when 7 then 2 when 8 then 3 when 9 then 4 end
from pickem_seasons s
join groups g on g.id = s.group_id
join pickem_pools p on p.group_id = g.id
where s.name = 'Test of Manhood'
  and g.name ilike '%test of manhood%'
  and p.variant = 'standard'
  and p.week in (6, 7, 8, 9)
on conflict do nothing;

-- ------------------------------------------------------------ verify
-- Expect: one season row, rounds_linked = 4.
select s.name, s.rounds_total,
       (select count(*) from pickem_season_rounds r where r.season_id = s.id) as rounds_linked
from pickem_seasons s
join groups g on g.id = s.group_id
where g.name ilike '%test of manhood%' and s.name = 'Test of Manhood';
