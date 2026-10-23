"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startQuizRun, answerQuizQuestion, type AnswerResult } from "@/lib/quiz-actions";
import type { ServedQuestion } from "@/lib/quiz";
import { formatTotalTime } from "@/lib/quiz";
import { Card } from "@/components/ui";

// The hot seat. One question at a time, 15 seconds on a draining bar.
// The countdown here is presentation only — the server stamped
// served_at when the question left, and its clock is the one that
// grades. If this timer runs out first, it submits a timeout itself.

type Phase = "ready" | "loading" | "asking" | "feedback" | "done" | "error";

interface Feedback {
  correct: boolean;
  correctAnswer: string;
  timedOut: boolean;
  chosen: string | null;
}

export default function QuizPlayer({
  quizId,
  boardHref,
  alreadyStarted,
  questionCount,
}: {
  quizId: string;
  boardHref: string;
  alreadyStarted: boolean;
  questionCount: number;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [question, setQuestion] = useState<ServedQuestion | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [summary, setSummary] = useState<AnswerResult["summary"]>(null);
  const [error, setError] = useState<string>("");
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const runIdRef = useRef<string | null>(null);
  const deadlineRef = useRef(0);
  const submittedRef = useRef(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginQuestion = useCallback((q: ServedQuestion) => {
    setQuestion(q);
    setFeedback(null);
    setSubmitting(false);
    submittedRef.current = false;
    deadlineRef.current = Date.now() + q.seconds * 1000;
    setRemainingMs(q.seconds * 1000);
    setPhase("asking");
  }, []);

  const submit = useCallback(
    async (chosen: string | null) => {
      if (submittedRef.current || !runIdRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const result = await answerQuizQuestion(runIdRef.current, chosen);
        setFeedback({
          correct: result.correct,
          correctAnswer: result.correctAnswer,
          timedOut: result.timedOut,
          chosen,
        });
        setPhase("feedback");
        advanceTimerRef.current = setTimeout(() => {
          if (result.next) {
            beginQuestion(result.next);
          } else {
            setSummary(result.summary);
            setPhase("done");
          }
        }, 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [beginQuestion]
  );

  // The draining clock. rAF so the bar moves smoothly; expiry submits
  // the timeout itself rather than waiting on the player.
  useEffect(() => {
    if (phase !== "asking" || !question) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        void submit(null);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, question, submit]);

  useEffect(
    () => () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    },
    []
  );

  async function start() {
    setPhase("loading");
    setError("");
    try {
      const { runId, question: q } = await startQuizRun(quizId);
      runIdRef.current = runId;
      beginQuestion(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start your run.");
      setPhase("error");
    }
  }

  if (phase === "ready" || phase === "loading") {
    return (
      <Card className="text-center">
        <p className="text-sm text-slate-600">
          One run. {questionCount} questions, 15 seconds each — no looking
          anything up. Most correct wins; ties go to the fastest total time.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={phase === "loading"}
          className="mt-4 w-full rounded-full bg-[#c2410c] px-5 py-3 text-base font-semibold text-white transition hover:bg-[#a8380a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "loading" ? "Loading…" : alreadyStarted ? "Keep playing" : "Take the hot seat"}
        </button>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card className="text-center">
        <p className="font-semibold text-red-700">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Try again
          </button>
          <Link
            href={boardHref}
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Back to the board
          </Link>
        </div>
      </Card>
    );
  }

  if (phase === "done" && summary) {
    return (
      <Card className="text-center">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-slate-500">
          Run complete
        </p>
        <p className="mt-2 font-display text-5xl font-bold tabular-nums leading-none">
          {summary.correctCount}
          <span className="text-2xl text-slate-400"> / {summary.questionCount}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Total time {formatTotalTime(summary.totalMs)}
        </p>
        <Link
          href={boardHref}
          className="mt-4 inline-block rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          See the board
        </Link>
      </Card>
    );
  }

  if (!question) return null;

  const totalMs = question.seconds * 1000;
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const inFeedback = phase === "feedback";

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Question {question.idx + 1} of {question.total}
        </p>
        <p
          className={`font-display text-2xl font-bold tabular-nums leading-none ${
            secondsLeft <= 5 && !inFeedback ? "text-[#c2410c]" : "text-slate-700"
          }`}
        >
          {inFeedback ? "" : `${secondsLeft}s`}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#c2410c]"
          style={{ width: inFeedback ? "0%" : `${pct}%` }}
        />
      </div>

      <p className="mt-4 text-lg font-semibold leading-snug text-slate-900">
        {question.question}
      </p>

      {inFeedback && feedback && (
        <p
          className={`mt-3 text-sm font-semibold ${
            feedback.correct ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {feedback.correct
            ? "Correct."
            : feedback.timedOut
              ? "Time's up — too slow."
              : "No good."}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {question.choices.map((choice) => {
          let cls = "border-slate-300 bg-white text-slate-800 hover:border-slate-500";
          if (inFeedback && feedback) {
            if (choice === feedback.correctAnswer) {
              cls = "border-emerald-500 bg-emerald-50 text-emerald-900";
            } else if (choice === feedback.chosen) {
              cls = "border-red-400 bg-red-50 text-red-900";
            } else {
              cls = "border-slate-200 bg-white text-slate-400";
            }
          }
          return (
            <button
              key={choice}
              type="button"
              disabled={inFeedback || submitting}
              onClick={() => void submit(choice)}
              className={`w-full rounded-xl border px-4 py-3.5 text-left text-base font-medium leading-snug transition disabled:cursor-default ${cls}`}
            >
              {choice}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
