-- 015: let the commish scratch a pick'em pool (tie / botched lines) instead of
-- being forced to crown a winner. Scratched pools settle with no winner, no
-- points, and no lifetime-board win.
alter table pickem_pools
  add column if not exists scratched boolean not null default false;
