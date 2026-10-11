-- 006: pool description — the rules live on the pool itself.
--
-- Michael's (correct) complaint: the scoring rules were only in the group
-- chat text, nowhere on the pool. Now the commish writes them into the
-- pool and they render on the pool page.
--
-- Safe to re-run.

alter table pools add column if not exists description text;
