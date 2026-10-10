-- 003: allow the "pending" status for the bet-acceptance flow
-- (new bets start pending until everyone accepts the invite).
--
-- Safe to re-run.

alter table bets drop constraint if exists bets_status_check;
alter table bets add constraint bets_status_check
  check (status in ('pending', 'open', 'awaiting', 'settled', 'disputed', 'void'));
