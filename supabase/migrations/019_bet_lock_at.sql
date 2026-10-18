-- Bet lock time: for live bets, nobody can accept after the lock passes.
-- Optional per bet; null means no lock (accept any time while pending).
alter table bets add column if not exists lock_at timestamptz;
