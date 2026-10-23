-- 025: quiz game ("The Hot Seat").
--
-- Millionaire-style, one solo run per member: the commish creates a quiz
-- (questions fetched from the Open Trivia DB and FROZEN at creation), every
-- member of the group plays one run against that same set before the quiz
-- closes, 15 seconds per question (server-timed), and the board ranks by
-- most correct with fastest total time breaking ties. Winners land on the
-- group's lifetime board exactly like pick'em co-winners.
--
-- Secrecy model: quiz_questions holds the correct answers, so it is
-- DENY-ALL for client roles — RLS is on and there is intentionally no
-- SELECT/UPDATE/DELETE policy. The only reads happen inside server
-- actions through the service-role client (lib/supabase/service.ts, the
-- same server-only escape hatch the ESPN sync uses), after the action
-- has authenticated the user and checked membership/ownership with the
-- session client. The creator gets an INSERT-only policy so creation
-- works through the session client without any read path. quiz_answers
-- is nearly as sensitive (a finished player's chosen+correct rows would
-- leak answers to anyone still to play), so members can read answers
-- only once the quiz has closed; the run's owner can always read their
-- own.
--
-- Safe to re-run.

-- ---------------------------------------------------------------- quizzes
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  title text not null,
  category_label text not null default 'Mixed',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  question_count int not null default 10 check (question_count > 0),
  close_at timestamptz not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists quizzes_group_idx on quizzes (group_id);

-- --------------------------------------------------------- quiz questions
-- Frozen at creation. choices holds all four answers (order meaningless —
-- the server shuffles per run at serve time). correct_answer never leaves
-- the server; see the secrecy note at the top.
create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  idx int not null,
  question text not null,
  correct_answer text not null,
  choices jsonb not null,
  unique (quiz_id, idx)
);
create index if not exists quiz_questions_quiz_idx on quiz_questions (quiz_id);

-- --------------------------------------------------------------- quiz runs
-- One run per member per quiz, ever. current_idx = the question the run
-- is on; served_at = when the server served that question (the referee
-- clock — the client's countdown is presentation only). total_ms sums the
-- per-answer time, each capped at the 17s limit (15s + latency grace).
create table if not exists quiz_runs (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  current_idx int not null default 0,
  served_at timestamptz,
  correct_count int not null default 0,
  total_ms int not null default 0,
  unique (quiz_id, user_id)
);
create index if not exists quiz_runs_quiz_idx on quiz_runs (quiz_id);

-- ------------------------------------------------------------ quiz answers
create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references quiz_runs (id) on delete cascade,
  question_id uuid not null references quiz_questions (id) on delete cascade,
  chosen text,
  correct boolean not null default false,
  ms_used int not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, question_id)
);
create index if not exists quiz_answers_run_idx on quiz_answers (run_id);

-- ------------------------------------------------------------ quiz winners
-- Same shape as pickem_pool_winners (020) so the lifetime board sums it
-- the same way: top finished run(s), 10 pts each.
create table if not exists quiz_winners (
  quiz_id uuid not null references quizzes (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  points int not null default 10 check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);

-- ------------------------------------------------------------------ RLS
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_runs enable row level security;
alter table quiz_answers enable row level security;
alter table quiz_winners enable row level security;

-- quizzes: members read; any member can create (creator = commish, same
-- as pick'em pools); the creator updates/deletes.
drop policy if exists "quizzes readable" on quizzes;
create policy "quizzes readable" on quizzes
  for select to authenticated using (is_group_member(group_id));

drop policy if exists "quizzes creatable" on quizzes;
create policy "quizzes creatable" on quizzes
  for insert to authenticated
  with check (is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "quizzes commish update" on quizzes;
create policy "quizzes commish update" on quizzes
  for update to authenticated using (created_by = auth.uid());

drop policy if exists "quizzes commish delete" on quizzes;
create policy "quizzes commish delete" on quizzes
  for delete to authenticated using (created_by = auth.uid());

-- quiz_questions: INSERT-only, for the creator of the quiz, and NO other
-- policy — in particular no SELECT for anyone. Reads are service-role
-- only, inside server actions. (An insert without RETURNING needs no
-- select policy, so creation never gains a read path.)
drop policy if exists "quiz questions creator insert" on quiz_questions;
create policy "quiz questions creator insert" on quiz_questions
  for insert to authenticated
  with check (
    exists (
      select 1 from quizzes q
      where q.id = quiz_questions.quiz_id and q.created_by = auth.uid()
    )
  );

-- quiz_runs: members read the board data (names/scores are the trash-talk
-- surface, gated for display on the page like pick'em reveals); a member
-- starts only their own run and updates only their own run.
drop policy if exists "quiz runs readable" on quiz_runs;
create policy "quiz runs readable" on quiz_runs
  for select to authenticated using (
    is_group_member((select group_id from quizzes where quizzes.id = quiz_runs.quiz_id))
  );

drop policy if exists "quiz runs own insert" on quiz_runs;
create policy "quiz runs own insert" on quiz_runs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_group_member((select group_id from quizzes where quizzes.id = quiz_runs.quiz_id))
  );

drop policy if exists "quiz runs own update" on quiz_runs;
create policy "quiz runs own update" on quiz_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- quiz_answers: you write answers only into your own run. Reads: your
-- own answers anytime; other members' answers only after the quiz has
-- closed (before that, chosen+correct would hand out the answer key).
drop policy if exists "quiz answers own insert" on quiz_answers;
create policy "quiz answers own insert" on quiz_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from quiz_runs r
      where r.id = quiz_answers.run_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "quiz answers readable" on quiz_answers;
create policy "quiz answers readable" on quiz_answers
  for select to authenticated using (
    exists (
      select 1 from quiz_runs r
      join quizzes q on q.id = r.quiz_id
      where r.id = quiz_answers.run_id
        and (
          r.user_id = auth.uid()
          or (is_group_member(q.group_id) and q.close_at <= now())
        )
    )
  );

-- quiz_winners: mirrors pickem_pool_winners — members read, only the
-- quiz's creator (commish) inserts.
drop policy if exists "quiz winners readable" on quiz_winners;
create policy "quiz winners readable" on quiz_winners
  for select to authenticated
  using (
    exists (
      select 1 from quizzes q
      where q.id = quiz_winners.quiz_id and is_group_member(q.group_id)
    )
  );

drop policy if exists "quiz winners commish insert" on quiz_winners;
create policy "quiz winners commish insert" on quiz_winners
  for insert to authenticated
  with check (
    exists (
      select 1 from quizzes q
      where q.id = quiz_winners.quiz_id and q.created_by = auth.uid()
    )
  );
