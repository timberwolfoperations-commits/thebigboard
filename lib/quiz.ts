// The Hot Seat — pure quiz logic, shared by the server actions (the
// referee) and the pages. No I/O here: timing verdicts, winner math,
// entity decoding and choice shuffling, so the rules can be verified
// without a database.

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
// One page of Open Trivia DB results, as createQuiz fetches it: the raw
// results on success, null when the service didn't answer (network
// error, bad status, non-zero response code). createQuiz injects the
// real fetcher; tests inject a stub.
export type TriviaSetFetcher = (
  difficulty: string,
  amount: number
) => Promise<any[] | null>;

// Dedupe key: the DECODED question text, so the same question wearing
// different entity spellings in two responses still counts once.
function triviaQuestionKey(raw: any): string {
  return decodeEntities(String(raw?.question ?? "")).trim().toLowerCase();
}

// Assemble the frozen question set for a new quiz.
//
// Easy and Hard are a single fetch, exactly as they've always been.
// Medium is a BLEND — half Easy, half Medium, shuffled together.
// OpenTDB's own difficulty labels skew hard: the first Medium quiz
// played "hard as hell," so a Medium set built purely from Medium
// questions doesn't feel like one. The quiz row still stores difficulty
// 'medium' (labels and boards unchanged) — the blend is a fetch-time
// behavior only, invisible everywhere else.
//
// Returns the raw result rows — length === count on success, fewer
// when the bank couldn't supply enough unique questions — plus
// `unavailable` when every fetch went unanswered, so the caller keeps
// picking the right error of the two creation has always had.
export async function assembleTriviaSet(args: {
  count: number;
  difficulty: string;
  fetchSet: TriviaSetFetcher;
  rng?: () => number;
}): Promise<{ results: any[]; unavailable: boolean }> {
  const { count, difficulty, fetchSet } = args;
  const rng = args.rng ?? Math.random;

  if (difficulty !== "medium") {
    const results = await fetchSet(difficulty, count);
    if (results == null) return { results: [], unavailable: true };
    return { results, unavailable: false };
  }

  const pool: any[] = [];
  const seen = new Set<string>();
  let answered = 0;
  const add = (rows: any[] | null) => {
    if (rows == null) return;
    answered++;
    for (const r of rows) {
      const key = triviaQuestionKey(r);
      if (key && !seen.has(key)) {
        seen.add(key);
        pool.push(r);
      }
    }
  };

  add(await fetchSet("easy", Math.ceil(count / 2)));
  add(await fetchSet("medium", Math.floor(count / 2)));
  // The two pages can overlap (or come back short), leaving the pool
  // under count: top up once from Medium, then once from Easy, asking
  // only for the deficit each time.
  if (pool.length < count) add(await fetchSet("medium", count - pool.length));
  if (pool.length < count) add(await fetchSet("easy", count - pool.length));

  return {
    results: shuffle(pool, rng).slice(0, count),
    unavailable: answered === 0,
  };
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
