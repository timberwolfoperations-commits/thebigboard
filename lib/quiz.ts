// The Hot Seat — pure quiz logic, shared by the server actions (the
// referee) and the pages. No I/O here: timing verdicts, winner math,
// entity decoding and choice shuffling, so the rules can be verified
// without a database.

import { TRIVIA_BANK, type BankCategory } from "@/lib/trivia-bank";

// 15 seconds a question, hard — the whole point is nobody can look the
// answer up. The server allows 2s of grace for network latency before
// it calls a timeout; per-answer time is capped at the limit so a
// timeout costs the same as the slowest legal answer.
export const QUESTION_SECONDS = 15;
export const ANSWER_LIMIT_MS = (QUESTION_SECONDS + 2) * 1000;
export const QUIZ_WINNER_POINTS = 10;

export interface QuizCategory {
  label: string;
  id: number | null; // Open Trivia DB category id; null = omit the param
}

export const QUIZ_CATEGORIES: QuizCategory[] = [
  { label: "Mixed", id: null },
  { label: "General Knowledge", id: 9 },
  { label: "Sports", id: 21 },
  { label: "Movies", id: 11 },
  { label: "Television", id: 14 },
  { label: "Music", id: 12 },
  { label: "History", id: 23 },
  { label: "Geography", id: 22 },
  { label: "Science & Nature", id: 17 },
  { label: "Video Games", id: 15 },
];

export const QUIZ_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const QUIZ_COUNTS = [5, 10, 15] as const;

// ------------------------------------------------------------ HTML entities
// Open Trivia DB ships questions littered with &quot; &#039; &eacute;…
// Single regex pass so an already-decoded "&" can't decode twice.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", Eacute: "É", agrave: "à", egrave: "è", ccedil: "ç",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
  szlig: "ß", ntilde: "ñ", Ntilde: "Ñ", aacute: "á", iacute: "í",
  oacute: "ó", uacute: "ú", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", hellip: "…", mdash: "—", ndash: "–", deg: "°",
  copy: "©", reg: "®", trade: "™", laquo: "«", raquo: "»",
  frac12: "½", frac14: "¼", frac34: "¾", times: "×", divide: "÷",
  plusmn: "±", micro: "µ", para: "¶", middot: "·", bull: "•",
  dagger: "†", permil: "‰", prime: "′", Prime: "″", oline: "‾",
  euro: "€", pound: "£", yen: "¥", cent: "¢", curren: "¤",
  sup1: "¹", sup2: "²", sup3: "³", ordm: "º", ordf: "ª",
  iexcl: "¡", iquest: "¿", szlig2: "ß", yuml: "ÿ", Yuml: "Ÿ",
  circ: "ˆ", tilde: "˜", ensp: " ", emsp: " ", thinsp: " ",
  zwnj: "", zwj: "", lrm: "", rlm: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      return whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

// ------------------------------------------------------------------ shuffle
// Fisher-Yates. rng is injectable so tests can be deterministic.
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------- question supply
// How createQuiz buys questions from the Open Trivia DB.
//
// ONE pull does the buying: amount=50, the chosen category, and NO
// difficulty param. The bank answers with a natural spread of levels
// and every row carries its own `difficulty`, so a single response can
// fill an Easy, Medium or Hard quiz alike (selection below). The old
// strategy — a burst of small per-difficulty fetches, with top-ups
// repeating the same URLs verbatim — broke live on 2026-10-22:
// OpenTDB rate-limits per IP (response_code 5) and Vercel's egress IPs
// are shared and heavily throttled, so the later fetches in the burst
// came back empty and a 10-question Medium/Mixed create died with
// "Only got 5…". Fewer requests, each asking for more, is the whole
// fix. Nothing from OpenTDB is ever cached either (cache: "no-store"
// in the puller below): a cached repeat hands back the very same
// questions and dedupe adds zero.
//
// Medium is still a BLEND — aim for half Medium, fill with Easy —
// because the bank's own Medium runs hard ("hard as hell," per the
// first Medium quiz played). Any easy+medium mix totalling the count
// is acceptable; hards never make a Medium set. Easy takes only
// easies, Hard only hards. The quiz row still stores the chosen
// difficulty — the blend is a selection-time behavior only.
export const TRIVIA_PULL_AMOUNT = 50;
// OpenTDB's rate-limit window is per-IP over ~5s; wait it out once.
export const TRIVIA_RATE_LIMIT_WAIT_MS = 5500;

export const TRIVIA_RATE_LIMIT_MESSAGE =
  "The trivia bank is rate-limiting us right now — give it a few seconds and try again.";
export const TRIVIA_UNAVAILABLE_MESSAGE =
  "The trivia service didn't answer — try again in a minute.";
export function triviaShortMessage(got: number, count: number, categoryLabel: string): string {
  return `Only got ${got} of ${count} questions for ${categoryLabel} — try fewer questions or a different category.`;
}

// One OpenTDB request's outcome. response_code 5 (rate limit) gets its
// own kind because it's the one failure worth a wait-and-retry; every
// other non-answer (network error, bad status, other non-zero code)
// folds into "unavailable". response_code 1 ("no results for that
// query") is an answer, not an outage: ok with an empty page, so a
// genuinely thin category flows into the fallback / short-set paths
// instead of claiming the service never replied.
export type TriviaPullOutcome =
  | { kind: "ok"; results: any[] }
  | { kind: "rate_limited" }
  | { kind: "unavailable" };

// One OpenTDB request. difficulty omitted = the big mixed pull;
// present = the difficulty-specific fallback page.
export type TriviaPuller = (args: {
  amount: number;
  difficulty?: string;
}) => Promise<TriviaPullOutcome>;

// The real puller over an injected fetch (the action passes the global
// one; tests pass a stub), no-store on every request it ever makes.
export function createOpenTdbPuller(args: {
  fetchImpl: typeof fetch;
  categoryId: number | null;
}): TriviaPuller {
  return async ({ amount, difficulty }) => {
    const url = new URL("https://opentdb.com/api.php");
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("type", "multiple");
    if (args.categoryId != null) url.searchParams.set("category", String(args.categoryId));
    if (difficulty) url.searchParams.set("difficulty", difficulty);
    try {
      const res = await args.fetchImpl(url, { cache: "no-store" });
      if (!res.ok) return { kind: "unavailable" };
      const json: any = await res.json();
      if (json?.response_code === 5) return { kind: "rate_limited" };
      if (json?.response_code === 1) return { kind: "ok", results: [] };
      if (json?.response_code !== 0 || !Array.isArray(json?.results)) {
        return { kind: "unavailable" };
      }
      return { kind: "ok", results: json.results };
    } catch {
      return { kind: "unavailable" };
    }
  };
}

// ------------------------------------------------------------ built-in bank
// The fallback puller: serves the hand-written bank that ships with the
// app (lib/trivia-bank.ts) through the same TriviaPuller interface, so
// assembleTriviaSet's selection (dedupe, difficulty buckets, the Medium
// blend) works on it unchanged. It never fails — the bank is local —
// which is the entire point: createQuiz reaches for it whenever the
// live OpenTDB supply fails for any reason, after OpenTDB went silent
// mid-evening on 2026-10-29 and quiz creation died with it.

// Which bank section serves a quiz category. The entertainment trio
// maps to pop culture; the categories the bank doesn't cover (Mixed,
// General Knowledge, Science & Nature, Video Games) draw on the whole
// bank — a general set beats a dead create form.
export function bankCategoryFor(categoryLabel: string): BankCategory | null {
  switch (categoryLabel) {
    case "Sports":
      return "sports";
    case "History":
      return "history";
    case "Geography":
      return "geography";
    case "Movies":
    case "Television":
    case "Music":
      return "pop";
    default:
      return null;
  }
}

export function createBankPuller(args: {
  bank: BankCategory | null;
}): TriviaPuller {
  return async ({ difficulty }) => {
    const rows = TRIVIA_BANK.filter(
      (q) =>
        (args.bank == null || q.bank === args.bank) &&
        (difficulty == null || q.difficulty === difficulty)
    ).map((q) => ({
      type: "multiple",
      category: q.bank,
      difficulty: q.difficulty,
      question: q.question,
      correct_answer: q.correct_answer,
      incorrect_answers: [...q.incorrect_answers],
    }));
    return { kind: "ok", results: rows };
  };
}

// Dedupe key: the DECODED question text, so the same question wearing
// different entity spellings in two responses still counts once.
function triviaQuestionKey(raw: any): string {
  return decodeEntities(String(raw?.question ?? "")).trim().toLowerCase();
}

// Pick `count` questions of the wanted flavour out of a deduped pool,
// bucketing by each row's own difficulty label. Medium aims for
// ceil(count/2) mediums, then easies, then any mediums left over —
// easies fill in when mediums run short and vice versa, never hards.
// The pick is shuffled so the levels interleave through the run.
function selectTriviaSet(
  pool: readonly any[],
  difficulty: string,
  count: number,
  rng: () => number
): any[] {
  const bucket = (level: string) =>
    shuffle(pool.filter((r) => String(r?.difficulty ?? "") === level), rng);
  let chosen: any[];
  if (difficulty === "medium") {
    const mediums = bucket("medium");
    const easies = bucket("easy");
    const aim = Math.ceil(count / 2);
    chosen = [...mediums.slice(0, aim), ...easies, ...mediums.slice(aim)].slice(0, count);
  } else {
    chosen = bucket(difficulty).slice(0, count);
  }
  return shuffle(chosen, rng);
}

export type TriviaSetFailure = "rate_limited" | "unavailable" | "short";

// Assemble the frozen question set for a new quiz from ONE pull (see
// the supply note above), plus at most one difficulty-specific
// fallback when a narrow category's pull can't fill the count.
// Returns the raw result rows — length === count on success — or a
// failure kind the caller turns into the matching error message
// (rate_limited / unavailable / short). `sleep` is injectable so
// tests don't wait out the real rate-limit pause.
export async function assembleTriviaSet(args: {
  count: number;
  difficulty: string;
  pull: TriviaPuller;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}): Promise<{ results: any[]; failure: TriviaSetFailure | null }> {
  const { count, difficulty, pull } = args;
  const rng = args.rng ?? Math.random;
  const sleep =
    args.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // The pull, with the one bounded retry: a rate-limited bank gets
  // its window to breathe, then exactly one more try. Any other
  // non-answer is the "didn't answer" failure, no retry, no fallback.
  let outcome = await pull({ amount: TRIVIA_PULL_AMOUNT });
  if (outcome.kind === "rate_limited") {
    await sleep(TRIVIA_RATE_LIMIT_WAIT_MS);
    outcome = await pull({ amount: TRIVIA_PULL_AMOUNT });
    if (outcome.kind === "rate_limited") return { results: [], failure: "rate_limited" };
  }
  if (outcome.kind === "unavailable") return { results: [], failure: "unavailable" };

  const seen = new Set<string>();
  const pool: any[] = [];
  const add = (rows: readonly any[]) => {
    for (const r of rows) {
      const key = triviaQuestionKey(r);
      if (key && !seen.has(key)) {
        seen.add(key);
        pool.push(r);
      }
    }
  };
  add(outcome.results);

  let selected = selectTriviaSet(pool, difficulty, count, rng);
  if (selected.length < count) {
    // The pull didn't hold enough of the wanted level (narrow
    // category): ONE difficulty-specific fetch — never a top-up loop —
    // merged and deduped into the same pool, then re-select.
    const fallback = await pull({ amount: count, difficulty });
    if (fallback.kind === "ok") {
      add(fallback.results);
      selected = selectTriviaSet(pool, difficulty, count, rng);
    }
  }
  if (selected.length < count) return { results: selected, failure: "short" };
  return { results: selected, failure: null };
}

// ------------------------------------------------------------- serve payload
export interface QuizQuestionRow {
  id: string;
  idx: number;
  question: string;
  correct_answer: string;
  choices: string[];
}

export interface ServedQuestion {
  idx: number;
  total: number;
  question: string;
  choices: string[];
  seconds: number;
}

// The ONLY way a question leaves the server during a run: an explicit
// allowlist of fields. correct_answer (and the question id) never make
// the trip — grading happens entirely server-side.
export function toServedQuestion(
  row: QuizQuestionRow,
  total: number,
  rng: () => number = Math.random
): ServedQuestion {
  return {
    idx: row.idx,
    total,
    question: row.question,
    choices: shuffle(row.choices, rng),
    seconds: QUESTION_SECONDS,
  };
}

// ------------------------------------------------------------------ grading
export interface GradeVerdict {
  timedOut: boolean;
  correct: boolean;
  msUsed: number;
}

// The referee. elapsed is server-now minus the DB's served_at — the
// client's clock never counts. Past the limit (15s + 2s grace) the
// answer is a timeout: wrong no matter what was picked, and the time
// charged is capped at the limit.
export function gradeAnswer(input: {
  servedAtMs: number;
  nowMs: number;
  chosen: string | null;
  correctAnswer: string;
}): GradeVerdict {
  const elapsed = Math.max(0, input.nowMs - input.servedAtMs);
  const timedOut = elapsed > ANSWER_LIMIT_MS;
  const correct =
    !timedOut && input.chosen != null && input.chosen === input.correctAnswer;
  return { timedOut, correct, msUsed: Math.min(elapsed, ANSWER_LIMIT_MS) };
}

// ------------------------------------------------------------------ winners
export interface QuizRunStanding {
  user_id: string;
  correct_count: number;
  total_ms: number;
  finished_at: string | null;
}

// Rank finished runs: most correct first, fastest total time breaks the
// tie. Unfinished runs never rank (they didn't play a full run).
export function rankQuizRuns<T extends QuizRunStanding>(runs: readonly T[]): T[] {
  return runs
    .filter((r) => r.finished_at != null)
    .sort(
      (a, b) => b.correct_count - a.correct_count || a.total_ms - b.total_ms
    );
}

// Winners = every finished run tied at the top on BOTH most-correct and
// total time. A same-score run that was strictly faster wins alone; an
// exact tie on both numbers is a genuine dead heat, so co-winners share
// it — the pick'em co-winner rule, with time as the first tiebreak.
export function pickQuizWinners(runs: readonly QuizRunStanding[]): string[] {
  const ranked = rankQuizRuns(runs);
  if (ranked.length === 0) return [];
  const top = ranked[0];
  return ranked
    .filter((r) => r.correct_count === top.correct_count && r.total_ms === top.total_ms)
    .map((r) => r.user_id);
}

// --------------------------------------------------------------------- misc
// 754000 -> "12:34". Total run times for the board.
export function formatTotalTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
