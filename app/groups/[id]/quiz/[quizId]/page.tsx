import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { awardQuizWinner } from "@/lib/quiz-actions";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import {
  QUIZ_WINNER_POINTS,
  formatTotalTime,
  pickQuizWinners,
  rankQuizRuns,
} from "@/lib/quiz";
import { Card, SectionTitle, SubmitButton } from "@/components/ui";
import QuizPlayer from "@/components/quiz-player";

function fmtClose(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string; quizId: string }>;
}) {
  const { id, quizId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: quiz } = await supabase.from("quizzes").select("*").eq("id", quizId).single();
  if (!quiz) redirect(`/groups/${id}`);

  const { data: runRows } = await supabase
    .from("quiz_runs")
    .select("user_id, correct_count, total_ms, started_at, finished_at, profiles(display_name)")
    .eq("quiz_id", quizId);
  const runs = ((runRows ?? []) as any[]).map((r) => ({
    user_id: r.user_id,
    display_name: r.profiles?.display_name ?? "Player",
    correct_count: r.correct_count,
    total_ms: r.total_ms,
    started_at: r.started_at,
    finished_at: r.finished_at,
  }));
  const avatars = await getAvatarMap(supabase, runs.map((r) => r.user_id));

  const { data: winnerRows } = await supabase
    .from("quiz_winners")
    .select("user_id")
    .eq("quiz_id", quizId);
  const winnerIds = new Set(((winnerRows ?? []) as any[]).map((w) => w.user_id));
  const winnerNames = runs.filter((r) => winnerIds.has(r.user_id)).map((r) => r.display_name);

  const closed = new Date(quiz.close_at).getTime() <= Date.now();
  const isCommish = quiz.created_by === user.id;
  const myRun = runs.find((r) => r.user_id === user.id) ?? null;
  const finishedRuns = runs.filter((r) => r.finished_at);
  const playingRuns = runs.filter((r) => !r.finished_at);

  // Reveal ethics, same as pick'em: scores are public once YOU have
  // finished your run or the quiz has closed. Before that you see who's
  // played, not how they did — no target to chase, no answers to infer.
  const canSeeScores = closed || Boolean(myRun?.finished_at);
  const ranked = rankQuizRuns(runs);
  const boardRows = canSeeScores
    ? [...ranked, ...playingRuns]
    : [
        ...finishedRuns.sort((a, b) => a.started_at.localeCompare(b.started_at)),
        ...playingRuns,
      ];
  const leaderNames = pickQuizWinners(runs)
    .map((uid) => runs.find((r) => r.user_id === uid)?.display_name ?? "Player");

  const awardWinner = awardQuizWinner.bind(null, quizId);
  const difficultyLabel =
    String(quiz.difficulty).charAt(0).toUpperCase() + String(quiz.difficulty).slice(1);

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <div className="text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">{quiz.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {quiz.category_label} · {difficultyLabel} · {quiz.question_count} questions ·{" "}
          {closed ? (
            <span className="font-semibold text-red-600">closed</span>
          ) : (
            <span>
              closes <span className="font-semibold">{fmtClose(quiz.close_at)} ET</span>
            </span>
          )}
        </p>
      </div>

      {winnerNames.length > 0 && (
        <Card>
          <p className="text-sm">
            <span className="font-semibold">
              {winnerNames.length > 1 ? "Co-winners: " : "Winner: "}
              {winnerNames.join(", ")}
            </span>
            <span className="text-slate-500">
              {" "}· +{QUIZ_WINNER_POINTS} pts{winnerNames.length > 1 ? " each" : ""} on the lifetime board
            </span>
          </p>
        </Card>
      )}

      {!closed && (!myRun || !myRun.finished_at) && (
        <div>
          <SectionTitle>{myRun ? "Your run" : "Play"}</SectionTitle>
          <QuizPlayer
            quizId={quizId}
            boardHref={`/groups/${id}/quiz/${quizId}`}
            alreadyStarted={Boolean(myRun)}
            questionCount={quiz.question_count}
          />
        </div>
      )}

      {myRun?.finished_at && (
        <Card>
          <p className="text-sm text-slate-600">
            Your run:{" "}
            <span className="font-semibold text-slate-900">
              {myRun.correct_count} of {quiz.question_count} correct
            </span>{" "}
            · total time {formatTotalTime(myRun.total_ms)}
            {closed ? "" : " — the board opens up once everyone else is in or it closes."}
          </p>
        </Card>
      )}

      {closed && !myRun && (
        <Card>
          <p className="text-sm text-slate-500">This quiz has closed — you never took your run.</p>
        </Card>
      )}

      <div>
        <SectionTitle>The board</SectionTitle>
        {runs.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Nobody&rsquo;s played yet. First one in sets the bar.</p>
          </Card>
        ) : (
          <Card className="p-0">
            {boardRows.map((r, i) => {
              const finished = Boolean(r.finished_at);
              const rankedRow = canSeeScores && finished;
              return (
                <div
                  key={r.user_id}
                  className={`flex items-center justify-between px-5 py-3 ${i > 0 ? "border-t border-slate-100" : ""} ${r.user_id === user.id ? "bg-slate-50" : ""}`}
                >
                  <p className="flex items-center gap-2.5">
                    {rankedRow && (
                      <span className="font-display text-lg font-semibold tabular-nums text-slate-400">
                        {ranked.indexOf(r) + 1}
                      </span>
                    )}
                    <Avatar name={r.display_name} animal={avatars.get(r.user_id)} size={28} />
                    <span className="text-sm font-medium">
                      {r.display_name}
                      {r.user_id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                      {winnerIds.has(r.user_id) && (
                        <span className="ml-1 text-xs font-semibold text-accent">· winner</span>
                      )}
                    </span>
                  </p>
                  {finished ? (
                    rankedRow ? (
                      <p className="flex items-baseline gap-1.5">
                        <span className="font-display text-3xl font-bold tabular-nums leading-none">
                          {r.correct_count}
                          <span className="text-lg text-slate-400">/{quiz.question_count}</span>
                        </span>
                        <span className="text-xs tabular-nums text-slate-400">
                          {formatTotalTime(r.total_ms)}
                        </span>
                      </p>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">finished</span>
                    )
                  ) : (
                    <span className="text-xs font-semibold text-[#c2410c]">in the hot seat…</span>
                  )}
                </div>
              );
            })}
          </Card>
        )}
        {!canSeeScores && finishedRuns.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Scores stay hidden until you finish your run or the quiz closes.
          </p>
        )}
      </div>

      <Card>
        <SectionTitle>How it works</SectionTitle>
        <p className="whitespace-pre-wrap text-sm text-slate-700">
          One run each, against the same frozen set of questions. Fifteen seconds a
          question — the clock is the server&rsquo;s, and when it runs out the
          question is gone, so there&rsquo;s no time to look anything up. Most
          correct wins; a tie on correct answers goes to the fastest total time.
          Dead even on both and it&rsquo;s co-winners, +{QUIZ_WINNER_POINTS} pts
          each on the lifetime board.
        </p>
      </Card>

      {isCommish && closed && winnerNames.length === 0 && (
        <div>
          {finishedRuns.length > 0 ? (
            <Card>
              <form action={awardWinner} className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  The quiz is closed. Award{" "}
                  <span className="font-semibold text-slate-900">{leaderNames.join(", ")}</span>{" "}
                  +{QUIZ_WINNER_POINTS} pts{leaderNames.length > 1 ? " each" : ""}?
                </p>
                <SubmitButton>Award {leaderNames.length > 1 ? "winners" : "winner"}</SubmitButton>
              </form>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">Closed with no finished runs — nothing to award.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
