"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ANSWER_LIMIT_MS,
  QUIZ_CATEGORIES,
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_WINNER_POINTS,
  decodeEntities,
  gradeAnswer,
  pickQuizWinners,
  shuffle,
  toServedQuestion,
  type QuizQuestionRow,
  type ServedQuestion,
} from "@/lib/quiz";

// ------------------------------------------------------------- the Hot Seat
// Millionaire-style quiz: the commish freezes a question set at creation
// (Open Trivia DB), every member plays ONE solo run against it before the
// quiz closes, 15 seconds a question. The server is the referee: it
// serves questions one at a time, stamps served_at in the DB, and grades
// against the frozen answer. quiz_questions is deny-all under RLS (see
// migration 025), so the only reads of it happen here, through the
// service-role client, after the session client has authenticated the
// user and verified membership / run ownership. A served question's
// payload is built by toServedQuestion — the correct answer is never in
// it. It only comes back AFTER an answer is recorded, to power the
// right/wrong flash on a question that player has already burned.

type SessionClient = Awaited<ReturnType<typeof createClient>>;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

// Same gate as pool creation: any group member can create (the creator
// is the quiz's commish); non-members get bounced.
async function memberRole(supabase: SessionClient, groupId: string, userId: string) {
  const { data } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You're not in this group.");
  return data.role as "admin" | "member";
}

// datetime-local has no timezone; the app is Eastern-first for v1.
// (Same helper as pickem-actions.)
function parseEasternLock(raw: string): Date {
  const d = new Date(`${raw}:00-04:00`); // EDT (Oct). Revisit in EST.
  if (isNaN(d.getTime())) throw new Error("That close time doesn't parse.");
  return d;
}

async function loadQuiz(supabase: SessionClient, quizId: string) {
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .single();
  if (error || !quiz) throw new Error("Quiz not found.");
  return quiz as any;
}

// The one place question rows are read. Service role, server-only, and
// only ever called with ids the action itself resolved from a verified
// run — never with anything the client sent beyond the run id.
async function loadQuestion(quizId: string, idx: number): Promise<QuizQuestionRow> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("quiz_questions")
    .select("id, idx, question, correct_answer, choices")
    .eq("quiz_id", quizId)
    .eq("idx", idx)
    .single();
  if (error || !data) throw new Error("That question is missing — tell the commish.");
  return data as QuizQuestionRow;
}

// Stamp the clock and hand the player their question (answer-free).
async function serve(
  supabase: SessionClient,
  run: any,
  questionCount: number
): Promise<ServedQuestion> {
  const row = await loadQuestion(run.quiz_id, run.current_idx);
  const { error } = await supabase
    .from("quiz_runs")
    .update({ served_at: new Date().toISOString() })
    .eq("id", run.id);
  if (error) throw new Error(error.message);
  return toServedQuestion(row, questionCount);
}

// ------------------------------------------------------------------ create
export async function createQuiz(groupId: string, formData: FormData) {
  const { supabase, user } = await getUser();
  await memberRole(supabase, groupId, user.id);

  const title = String(formData.get("title") ?? "").trim() || "Quiz Night";
  const category = QUIZ_CATEGORIES.find(
    (c) => c.label === String(formData.get("category") ?? "Mixed")
  );
  if (!category) throw new Error("That category isn't on the list.");
  const difficulty = String(formData.get("difficulty") ?? "medium");
  if (!(QUIZ_DIFFICULTIES as readonly string[]).includes(difficulty)) {
    throw new Error("Pick easy, medium or hard.");
  }
  const count = parseInt(String(formData.get("count") ?? "10"), 10);
  if (!(QUIZ_COUNTS as readonly number[]).includes(count)) {
    throw new Error("Pick 5, 10 or 15 questions.");
  }
  const closeAt = parseEasternLock(String(formData.get("close_at") ?? ""));
  if (closeAt.getTime() <= Date.now()) throw new Error("Close time has to be in the future.");

  // Fetch and freeze. Anything short of the full set — API down, a
  // combo with too few questions — fails creation outright; a silently
  // short quiz would grade everyone's run against different totals.
  const url = new URL("https://opentdb.com/api.php");
  url.searchParams.set("amount", String(count));
  url.searchParams.set("type", "multiple");
  if (category.id != null) url.searchParams.set("category", String(category.id));
  url.searchParams.set("difficulty", difficulty);

  let results: any[] = [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json: any = await res.json();
    if (json?.response_code !== 0 || !Array.isArray(json?.results)) {
      throw new Error("no results");
    }
    results = json.results;
  } catch {
    throw new Error("The trivia service didn't answer — try again in a minute.");
  }
  if (results.length !== count) {
    throw new Error(
      `Only got ${results.length} ${difficulty} questions for ${category.label} — try Mixed or an easier difficulty.`
    );
  }

  const questions = results.map((r, idx) => {
    const question = decodeEntities(String(r?.question ?? "")).trim();
    const correct = decodeEntities(String(r?.correct_answer ?? "")).trim();
    const incorrect = (Array.isArray(r?.incorrect_answers) ? r.incorrect_answers : []).map(
      (a: unknown) => decodeEntities(String(a ?? "")).trim()
    );
    if (!question || !correct || incorrect.length !== 3 || incorrect.some((a: string) => !a)) {
      throw new Error("The trivia service sent a broken question — try again.");
    }
    // Frozen set of four; the serve-time shuffle is per run. (Shuffled
    // once here too so the stored order carries no tell.)
    return {
      idx,
      question,
      correct_answer: correct,
      choices: shuffle([correct, ...incorrect]),
    };
  });

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      group_id: groupId,
      title,
      category_label: category.label,
      difficulty,
      question_count: count,
      close_at: closeAt.toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Insert-only RLS policy (creator) covers this; no .select(), so no
  // read path is needed or granted.
  const { error: qErr } = await supabase
    .from("quiz_questions")
    .insert(questions.map((q) => ({ quiz_id: quiz.id, ...q })));
  if (qErr) {
    // Don't leave a question-less quiz behind.
    await supabase.from("quizzes").delete().eq("id", quiz.id);
    throw new Error(qErr.message);
  }

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}/quiz/${quiz.id}`);
}

// -------------------------------------------------------------------- play
export interface StartResult {
  runId: string;
  question: ServedQuestion;
}

// Start a run — or resume the one you already have. One run per member,
// ever: a finished run can never restart. Resuming re-serves the current
// question with a fresh clock (you still have to answer THAT question;
// per-answer time is capped, so bailing out buys no real advantage).
export async function startQuizRun(quizId: string): Promise<StartResult> {
  const { supabase, user } = await getUser();
  const quiz = await loadQuiz(supabase, quizId);
  await memberRole(supabase, quiz.group_id, user.id);
  if (new Date(quiz.close_at).getTime() <= Date.now()) {
    throw new Error("This quiz has closed.");
  }

  const { data: existing } = await supabase
    .from("quiz_runs")
    .select("*")
    .eq("quiz_id", quizId)
    .eq("user_id", user.id)
    .maybeSingle();

  let run = existing as any;
  if (run?.finished_at) throw new Error("You've already played this quiz — one run each.");
  if (run && run.current_idx >= quiz.question_count) {
    // Crashed mid-finish once — close it out rather than strand it.
    await supabase
      .from("quiz_runs")
      .update({ finished_at: new Date().toISOString(), served_at: null })
      .eq("id", run.id);
    throw new Error("You've already played this quiz — one run each.");
  }
  if (!run) {
    const { data: created, error } = await supabase
      .from("quiz_runs")
      .insert({ quiz_id: quizId, user_id: user.id })
      .select("*")
      .single();
    if (error || !created) {
      // Lost a double-tap race against the unique constraint — pick up
      // the run that won.
      const { data: again } = await supabase
        .from("quiz_runs")
        .select("*")
        .eq("quiz_id", quizId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!again) throw new Error(error?.message ?? "Couldn't start your run.");
      if ((again as any).finished_at) {
        throw new Error("You've already played this quiz — one run each.");
      }
      run = again;
    } else {
      run = created;
    }
  }

  const question = await serve(supabase, run, quiz.question_count);
  return { runId: run.id, question };
}

export interface AnswerResult {
  correct: boolean;
  correctAnswer: string;
  timedOut: boolean;
  msUsed: number;
  next: ServedQuestion | null;
  summary: { correctCount: number; totalMs: number; questionCount: number } | null;
}

// Answer the question currently on the clock. The server's served_at is
// the only clock that counts: past 17s (15 + grace) it's a timeout and
// wrong, whatever was picked. Idempotent against double-submits — an
// answer row that already exists wins, and the run just advances.
export async function answerQuizQuestion(
  runId: string,
  chosenRaw: string | null
): Promise<AnswerResult> {
  const { supabase, user } = await getUser();

  const { data: runRow } = await supabase
    .from("quiz_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (!runRow) throw new Error("Run not found.");
  const run = runRow as any;
  if (run.user_id !== user.id) throw new Error("That's not your run.");
  if (run.finished_at) throw new Error("That run is already finished.");
  if (!run.served_at) throw new Error("No question is on the clock — reload to keep playing.");

  const quiz = await loadQuiz(supabase, run.quiz_id);
  const row = await loadQuestion(run.quiz_id, run.current_idx);
  const chosen = chosenRaw == null ? null : String(chosenRaw);

  const { data: priorRow } = await supabase
    .from("quiz_answers")
    .select("*")
    .eq("run_id", run.id)
    .eq("question_id", row.id)
    .maybeSingle();

  let verdict: { timedOut: boolean; correct: boolean; msUsed: number };
  if (priorRow) {
    const prior = priorRow as any;
    verdict = {
      correct: Boolean(prior.correct),
      msUsed: Number(prior.ms_used) || 0,
      timedOut: !prior.correct && Number(prior.ms_used) >= ANSWER_LIMIT_MS,
    };
  } else {
    verdict = gradeAnswer({
      servedAtMs: new Date(run.served_at).getTime(),
      nowMs: Date.now(),
      chosen,
      correctAnswer: row.correct_answer,
    });
    const { error: aErr } = await supabase.from("quiz_answers").insert({
      run_id: run.id,
      question_id: row.id,
      chosen,
      correct: verdict.correct,
      ms_used: verdict.msUsed,
    });
    if (aErr) throw new Error(aErr.message);
  }

  // Counters are recomputed from the answer rows, never incremented —
  // the rows are the truth, so a crashed or retried answer can't drift
  // the run's score.
  const { data: answerRows } = await supabase
    .from("quiz_answers")
    .select("correct, ms_used")
    .eq("run_id", run.id);
  const correctCount = ((answerRows ?? []) as any[]).filter((a) => a.correct).length;
  const totalMs = ((answerRows ?? []) as any[]).reduce(
    (sum, a) => sum + (Number(a.ms_used) || 0),
    0
  );

  const nextIdx = (run.current_idx as number) + 1;
  const finished = nextIdx >= (quiz.question_count as number);
  const { error: uErr } = await supabase
    .from("quiz_runs")
    .update({
      current_idx: nextIdx,
      correct_count: correctCount,
      total_ms: totalMs,
      served_at: null,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", run.id);
  if (uErr) throw new Error(uErr.message);

  revalidatePath(`/groups/${quiz.group_id}/quiz/${quiz.id}`);

  if (finished) {
    return {
      correct: verdict.correct,
      correctAnswer: row.correct_answer,
      timedOut: verdict.timedOut,
      msUsed: verdict.msUsed,
      next: null,
      summary: {
        correctCount,
        totalMs,
        questionCount: quiz.question_count,
      },
    };
  }

  const next = await serve(
    supabase,
    { ...run, current_idx: nextIdx },
    quiz.question_count
  );
  return {
    correct: verdict.correct,
    correctAnswer: row.correct_answer,
    timedOut: verdict.timedOut,
    msUsed: verdict.msUsed,
    next,
    summary: null,
  };
}

// ------------------------------------------------------------------- award
// Once the quiz has closed, the commish crowns the top finished run(s):
// most correct, fastest total time breaking it. An exact tie on BOTH is
// a dead heat — co-winners, 10 pts each on the lifetime board, same as
// pick'em. One-shot: any quiz_winners row means it's done.
export async function awardQuizWinner(quizId: string) {
  const { supabase, user } = await getUser();
  const quiz = await loadQuiz(supabase, quizId);
  if (quiz.created_by !== user.id) throw new Error("Only the commish awards the winner.");
  if (new Date(quiz.close_at).getTime() > Date.now()) {
    throw new Error("The quiz hasn't closed yet.");
  }

  const { data: already } = await supabase
    .from("quiz_winners")
    .select("user_id")
    .eq("quiz_id", quizId);
  if ((already ?? []).length > 0) throw new Error("This quiz already has a winner.");

  const { data: runs } = await supabase
    .from("quiz_runs")
    .select("user_id, correct_count, total_ms, finished_at")
    .eq("quiz_id", quizId);
  const winners = pickQuizWinners((runs ?? []) as any[]);
  if (winners.length === 0) throw new Error("Nobody finished a run — nothing to award.");

  const { error } = await supabase
    .from("quiz_winners")
    .insert(winners.map((user_id) => ({ quiz_id: quizId, user_id, points: QUIZ_WINNER_POINTS })));
  if (error) throw new Error(error.message);

  revalidatePath(`/groups/${quiz.group_id}/quiz/${quizId}`);
  revalidatePath(`/groups/${quiz.group_id}`);
}
