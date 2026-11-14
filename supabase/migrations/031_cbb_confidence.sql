-- 031: CBB Top 5 Confidence pick'em (against the spread).
--
-- - pickem_picks.confidence: the rank a player puts on a pick in a
--   confidence pool, 5 (most confident) down to 1. Null for every other
--   variant — standard pools never set it. A correct confidence pick
--   pays its rank instead of 1 point (lib/pickem-scoring.ts).
-- - games.is_power_conf: both teams in a power conference (ACC, Big
--   Ten, Big 12, SEC, Big East), set by the CBB sync from the ESPN
--   team-id map in lib/cbb-conferences.ts. Together with the existing
--   is_top25 it defines the CBB top-games slate: ranked OR both-power.
-- - 'confidence' joins the pickem_pools variant check (same pattern as
--   migration 014 adding 'over_under').
--
-- Safe to re-run.

alter table pickem_picks
  add column if not exists confidence int check (confidence between 1 and 5);

alter table games
  add column if not exists is_power_conf boolean not null default false;

alter table pickem_pools drop constraint if exists pickem_pools_variant_check;
alter table pickem_pools add constraint pickem_pools_variant_check
  check (variant in ('standard', 'elimination', 'race_50', 'golf', 'over_under', 'confidence'));
