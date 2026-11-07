import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getPokerTableView,
  type PokerActionLogRow,
  type PokerSeatView,
  type PokerTableView,
} from "@/lib/poker-actions";
import { getAvatarMap } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";
import { Card, SectionTitle } from "@/components/ui";
import { CardBack, PokerCard, cardText } from "@/components/poker-card";
import PokerActions, { type PokerActionModel } from "@/components/poker-actions";
import { blindsForHand, type PublicHandView } from "@/lib/poker/engine";
import { evaluateHand } from "@/lib/poker/evaluate";
import { handRead } from "@/lib/poker/hand-read";
import { POKER_WINNER_POINTS } from "@/lib/poker/server";

// ------------------------------------------------------------- formatting
// Server components render in UTC on Vercel — every clock on this page
// is pinned to America/New_York explicitly (AGENTS.md).

function fmtClockET(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDayET(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${fmtClockET(iso)} ET`;
}

function timeLeft(iso: string, now: number): string {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000);
  if (mins <= 0) return "0m";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

function levelFor(handNumber: number): number {
  return Math.min(7, Math.ceil(handNumber / 3));
}

function nextBlindStep(handNumber: number): { hand: number; sb: number; bb: number } | null {
  const cur = blindsForHand(handNumber);
  for (let h = handNumber + 1; h <= handNumber + 6; h++) {
    const b = blindsForHand(h);
    if (b.bigBlind !== cur.bigBlind) return { hand: h, sb: b.smallBlind, bb: b.bigBlind };
  }
  return null;
}

// ------------------------------------------------------- the story of a hand
// The action log tells the story (streetSentences below walks it for
// the narrative). The raise MATH — min-raise size and whether betting
// was reopened — comes straight off the public view (minRaiseTo /
// mayRaise), which the engine computes from the live state; the log
// alone can't reconstruct it, because a short all-in that didn't
// reopen betting looks like any other all-in in the log. Log
// semantics (migration 027): a call's amount is the chips put in; a
// raise's or all-in's amount is the raise-TO total for the street.

const STREET_ORDER = ["preflop", "flop", "turn", "river"] as const;

function streetSentences(
  rows: PokerActionLogRow[],
  street: string,
  bigBlind: number,
  nameOfSeat: (seatNo: number) => string,
): string[] {
  const out: string[] = [];
  let level = street === "preflop" ? bigBlind : 0;
  for (const r of rows) {
    if (r.street !== street) continue;
    const name = nameOfSeat(r.seatNo);
    switch (r.action) {
      case "fold":
        out.push(r.isTimeout ? `${name} timed out — auto-folded` : `${name} folded`);
        break;
      case "check":
        out.push(r.isTimeout ? `${name} timed out — auto-checked` : `${name} checked`);
        break;
      case "call":
        out.push(`${name} called ${r.amount ?? 0}`);
        break;
      case "raise":
        out.push(level === 0 ? `${name} bet ${r.amount}` : `${name} raised to ${r.amount}`);
        if (r.amount != null && r.amount > level) level = r.amount;
        break;
      case "allin":
        out.push(
          r.amount != null && r.amount > level
            ? `${name} went all-in — raised to ${r.amount}`
            : `${name} went all-in to call ${r.amount ?? 0}`,
        );
        if (r.amount != null && r.amount > level) level = r.amount;
        break;
      default:
        out.push(`${name} ${r.action}`);
    }
  }
  return out;
}

function streetLabel(street: string, hand: PublicHandView): string {
  switch (street) {
    case "flop":
      return hand.board.length >= 3
        ? `Flop · ${hand.board.slice(0, 3).map(cardText).join(" ")}`
        : "Flop";
    case "turn":
      return hand.board.length >= 4 ? `Turn · ${cardText(hand.board[3])}` : "Turn";
    case "river":
      return hand.board.length >= 5 ? `River · ${cardText(hand.board[4])}` : "River";
    default:
      return "Pre-flop";
  }
}

// ------------------------------------------------------------------- page

function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export default async function PokerTablePage({
  params,
}: {
  params: Promise<{ id: string; tableId: string }>;
}) {
  const { id, tableId } = await params;

  let view: PokerTableView;
  try {
    view = await getPokerTableView(tableId);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return (
      <Card className="text-center">
        <p className="font-semibold">You&rsquo;re not in this table&rsquo;s group.</p>
        <Link href={`/groups/${id}`} className="mt-2 inline-block text-sm text-slate-600 underline">
          Back to group
        </Link>
      </Card>
    );
  }
  if (view.table.group_id !== id) {
    redirect(`/groups/${view.table.group_id}/poker/${tableId}`);
  }

  const supabase = await createClient();
  const { data: group } = await supabase.from("groups").select("name").eq("id", id).maybeSingle();
  const avatars = await getAvatarMap(supabase, view.seats.map((s) => s.user_id));

  const now = Date.now();
  const { table, hand } = view;
  const handActive = view.handStatus === "active" && hand !== null;
  const mySeatNo = view.mySeatNo;
  const mySeatRow = mySeatNo !== null ? view.seats.find((s) => s.seat_no === mySeatNo) : undefined;
  const myHandSeat = hand && mySeatNo !== null ? hand.seats[mySeatNo] : undefined;
  const isMyTurn = Boolean(handActive && hand && hand.toAct !== null && hand.toAct === mySeatNo);
  const nameOfSeat = (seatNo: number) =>
    view.seats.find((s) => s.seat_no === seatNo)?.displayName ?? "Player";
  const nameOfUser = (userId: string | null) =>
    view.seats.find((s) => s.user_id === userId)?.displayName ?? "Player";
  const winnerName = table.winner_user_id ? nameOfUser(table.winner_user_id) : null;

  // Action model for the prompt box (only when it's on the viewer).
  let actionModel: PokerActionModel | null = null;
  let promptDetail = "";
  if (isMyTurn && hand && myHandSeat && view.handId) {
    const owed = Math.min(hand.currentBet - myHandSeat.committedStreet, myHandSeat.stack);
    const maxTo = myHandSeat.committedStreet + myHandSeat.stack;
    const potRaiseRaw = hand.currentBet + hand.pot + owed;
    actionModel = {
      handId: view.handId,
      owed,
      stack: myHandSeat.stack,
      maxTo,
      minRaiseTo: hand.minRaiseTo,
      potRaiseTo: potRaiseRaw < maxTo ? potRaiseRaw : null,
      // mayRaise is the engine's word on whether betting was reopened
      // for me — after a short all-in it can be false even with chips
      // to spare, in which case only call/fold (or the all-in call)
      // remain and the panel hides Raise entirely.
      canRaise: hand.mayRaise && maxTo > hand.currentBet,
      deadlineAt: view.actionDeadlineAt,
      facingBet: owed > 0,
    };
    const sentences = streetSentences(view.actionLog, hand.street, hand.bigBlind, nameOfSeat);
    promptDetail =
      sentences.length === 0
        ? hand.street === "preflop"
          ? "Only the blinds are in so far."
          : `First to act on the ${hand.street}.`
        : `${sentences.slice(-3).join(". ")}.`;
  }

  const storySections = hand
    ? STREET_ORDER.map((st) => ({
        street: st,
        label: streetLabel(st, hand),
        sentences: streetSentences(view.actionLog, st, hand.bigBlind, nameOfSeat),
      })).filter((s) => s.sentences.length > 0)
    : [];

  const boardCaption = !hand
    ? ""
    : hand.street === "preflop"
      ? "The flop lands when pre-flop betting closes"
      : hand.street === "flop"
        ? "The turn lands when flop betting closes"
        : hand.street === "turn"
          ? "The river lands when turn betting closes"
          : hand.street === "river"
            ? "Every card is out — play it to the end"
            : "Final board";

  const stepUp = hand ? nextBlindStep(hand.handNumber) : null;

  return (
    <div className="space-y-6">
      <Link href={`/groups/${id}`} className="text-sm text-slate-500 underline-offset-4 hover:underline">
        ← Back to group
      </Link>

      <div className="text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
          {table.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {group?.name ?? "Group"}
          {hand
            ? ` · Hand ${hand.handNumber} · Level ${levelFor(hand.handNumber)}`
            : table.status === "complete"
              ? " · Tournament over"
              : ""}
        </p>
      </div>

      {table.status === "complete" && winnerName && (
        <div className="rounded-2xl border border-[#141414] bg-[#141414] p-5 text-center shadow-sm">
          <p className="font-display text-2xl font-bold uppercase tracking-wide text-[#f7f4ef]">
            {winnerName} takes it down
          </p>
          <p className="mt-1 text-sm text-[#b6b0a2]">
            Last one standing · +{POKER_WINNER_POINTS} lifetime points on the board
          </p>
        </div>
      )}

      {hand && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="rounded-full border border-[#e9e4da] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Blinds{" "}
              <b className="font-display text-[15px] text-slate-900">
                {hand.smallBlind} / {hand.bigBlind}
              </b>
            </span>
            <span className="rounded-full border border-[#e9e4da] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Pot <b className="font-display text-[15px] text-slate-900">{hand.pot}</b>
            </span>
            {myHandSeat && (
              <span className="rounded-full border border-[#e9e4da] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                Your stack{" "}
                <b className="font-display text-[15px] text-slate-900">{myHandSeat.stack}</b>
              </span>
            )}
            {handActive && view.actionDeadlineAt && (
              <span className="rounded-full border border-accent bg-white px-3 py-1.5 text-xs font-semibold text-accent">
                <b className="font-display text-[15px]">{timeLeft(view.actionDeadlineAt, now)}</b>{" "}
                {isMyTurn ? "to act" : "on the clock"}
              </span>
            )}
          </div>

          <div className="flex">
            {STREET_ORDER.map((st) => {
              const idx = STREET_ORDER.indexOf(st);
              const curIdx =
                hand.street === "complete" ? 4 : STREET_ORDER.indexOf(hand.street as (typeof STREET_ORDER)[number]);
              const state = idx < curIdx ? "done" : idx === curIdx ? "live" : "next";
              return (
                <div
                  key={st}
                  className={`flex-1 border-b-[3px] pb-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] ${
                    state === "live"
                      ? "border-accent text-slate-900"
                      : state === "done"
                        ? "border-slate-400 text-slate-500"
                        : "border-[#e9e4da] text-[#b6b0a2]"
                  }`}
                >
                  {st === "preflop" ? "Pre-flop" : st}
                  {state === "done" ? " ✓" : ""}
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4].map((i) =>
                hand.board[i] ? (
                  <PokerCard key={i} card={hand.board[i]} />
                ) : (
                  <CardBack
                    key={i}
                    label={i < 3 ? "Flop" : i === 3 ? "Turn" : "River"}
                  />
                ),
              )}
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">{boardCaption}</p>
          </div>
        </>
      )}

      {!hand && table.status !== "complete" && (
        <Card>
          <p className="text-sm text-slate-500">The first hand hasn&rsquo;t been dealt yet.</p>
        </Card>
      )}

      {/* ------------------------------------------------ your move */}
      {isMyTurn && hand && myHandSeat && actionModel && (
        <div className="rounded-2xl border border-slate-900 bg-white p-4 shadow-sm sm:p-5">
          <p className="font-display text-xl font-semibold uppercase tracking-wide">
            Your move, <span className="text-accent">{mySeatRow?.displayName ?? "player"}</span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{promptDetail}</p>
          {myHandSeat.cards && (
            <>
              <div className="mt-4 flex justify-center gap-2">
                {myHandSeat.cards.map((c, i) => (
                  <PokerCard key={i} card={c} size="lg" />
                ))}
              </div>
              <p className="mt-2 text-center text-sm text-slate-500">
                You&rsquo;ve got:{" "}
                <b className="font-semibold text-slate-900">
                  {handRead(myHandSeat.cards, hand.board)}
                </b>
              </p>
            </>
          )}
          <PokerActions model={actionModel} />
        </div>
      )}

      {/* ------------------------------------------------ waiting */}
      {!isMyTurn && handActive && hand && (
        <Card>
          {mySeatRow?.status === "busted" ? (
            <p className="text-sm text-slate-600">
              You&rsquo;re out of chips and out of the tournament — this is the rail now. Watch
              the endgame from here.
            </p>
          ) : hand.toAct !== null ? (
            <p className="text-sm text-slate-600">
              On <span className="font-semibold text-slate-900">{nameOfSeat(hand.toAct)}</span>{" "}
              now
              {view.actionDeadlineAt && (
                <>
                  {" "}
                  — clock runs out{" "}
                  <span className="font-semibold text-slate-900">
                    {fmtClockET(view.actionDeadlineAt)} ET
                  </span>
                  , and no answer means they{" "}
                  {hand.currentBet > hand.seats[hand.toAct].committedStreet
                    ? "fold (there's a bet in front of them)"
                    : "check (it's free)"}
                  .
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-600">The hand is settling.</p>
          )}
          {myHandSeat?.inHand && !myHandSeat.folded && myHandSeat.cards && (
            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
              <div className="flex gap-1.5">
                {myHandSeat.cards.map((c, i) => (
                  <PokerCard key={i} card={c} size="sm" />
                ))}
              </div>
              <p className="text-sm text-slate-500">
                Your hand:{" "}
                <b className="font-semibold text-slate-900">
                  {handRead(myHandSeat.cards, hand.board)}
                </b>
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ------------------------------------------------ hand result */}
      {hand?.result && (
        <div>
          <SectionTitle>Hand {hand.handNumber} — settled</SectionTitle>
          <Card>
            {hand.result.showdown ? (
              <div className="space-y-3">
                {Object.entries(hand.result.revealed).map(([seatKey, cards]) => {
                  const seatNo = Number(seatKey);
                  const won = hand.result!.payouts[seatNo] ?? 0;
                  return (
                    <div key={seatKey} className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        {cards.map((c, i) => (
                          <PokerCard key={i} card={c} size="sm" />
                        ))}
                      </div>
                      <p className="text-sm">
                        <span className="font-semibold">{nameOfSeat(seatNo)}</span>{" "}
                        <span className="text-slate-500">
                          {hand.board.length === 5
                            ? evaluateHand([...cards, ...hand.board]).name.toLowerCase()
                            : ""}
                        </span>
                        {won > 0 && (
                          <span className="font-semibold text-accent"> · collected {won}</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                {Object.entries(hand.result.payouts).map(([seatKey, amount]) => (
                  <span key={seatKey}>
                    <span className="font-semibold text-slate-900">
                      {nameOfSeat(Number(seatKey))}
                    </span>{" "}
                    took the {amount}-chip pot — everyone else folded.
                  </span>
                ))}
              </p>
            )}
            {hand.result.showdown && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                {Object.entries(hand.result.payouts)
                  .filter(([, amt]) => amt > 0)
                  .map(([seatKey, amt]) => `${nameOfSeat(Number(seatKey))} collected ${amt}`)
                  .join(" · ")}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* ------------------------------------------------ the story */}
      {storySections.length > 0 && (
        <div>
          <SectionTitle>
            {view.handStatus === "complete"
              ? `Hand ${hand!.handNumber} — how it went`
              : `Hand ${hand!.handNumber} so far`}
          </SectionTitle>
          <Card>
            <p className="text-sm text-slate-600">
              Blinds {hand!.smallBlind}/{hand!.bigBlind} · button with{" "}
              {nameOfSeat(hand!.button)}.
            </p>
            {storySections.map((s) => (
              <div key={s.street} className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#b6b0a2]">
                  {s.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {s.sentences.join(". ")}.
                </p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ------------------------------------------------ seats / standings */}
      {hand && (
        <div>
          <SectionTitle>{isMyTurn ? "At the table" : "Tournament"}</SectionTitle>
          <Card className="p-0">
            {(isMyTurn ? view.seats : view.standings).map((seat, i) => {
              const hs = hand.seats[seat.seat_no];
              // Mid-hand, behind + committed is the player's whole stack
              // (chips only change hands at the payout). Once the hand is
              // complete the seat row is authoritative — payouts are
              // already banked into it.
              const effStack =
                view.handStatus === "active" && hs ? hs.stack + hs.committedHand : seat.stack;
              const tags: { label: string; hot?: boolean }[] = [];
              let note = "";
              if (seat.status === "busted") {
                note = "Busted";
              } else if (hs && !hs.inHand) {
                note = "Sat this hand out";
              } else if (hs?.folded) {
                note = "Folded";
              } else if (hs?.allIn) {
                tags.push({ label: "All-in", hot: true });
              } else if (handActive && hand.toAct === seat.seat_no) {
                tags.push({ label: "On the clock", hot: true });
              } else if (hs && hs.committedStreet > 0) {
                tags.push({ label: `In for ${hs.committedStreet}` });
              } else if (hs?.inHand) {
                note = "In the hand";
              }
              if (hand.button === seat.seat_no && seat.status !== "busted") {
                tags.push({ label: "Button" });
              }
              return (
                <div
                  key={seat.id}
                  className={`flex items-center gap-2.5 px-5 py-3 ${i > 0 ? "border-t border-slate-100" : ""} ${
                    hs?.folded || seat.status === "busted" ? "opacity-40" : ""
                  } ${seat.seat_no === mySeatNo ? "bg-slate-50" : ""}`}
                >
                  {isMyTurn ? (
                    <Avatar
                      name={seat.displayName ?? "Player"}
                      animal={avatars.get(seat.user_id)}
                      size={30}
                    />
                  ) : (
                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md bg-[#141414] font-display text-sm font-bold text-[#f7f4ef]">
                      {i + 1}
                    </span>
                  )}
                  <p className="min-w-0">
                    <span className="text-sm font-semibold">
                      {seat.displayName ?? "Player"}
                      {seat.seat_no === mySeatNo && (
                        <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>
                      )}
                    </span>
                    {tags.map((t) => (
                      <span
                        key={t.label}
                        className={`ml-1.5 inline-block rounded border px-1 py-px align-middle text-[10px] font-bold uppercase tracking-wider ${
                          t.hot
                            ? "border-accent text-accent"
                            : "border-[#e9e4da] text-slate-500"
                        }`}
                      >
                        {t.label}
                      </span>
                    ))}
                    {note && <span className="block text-xs text-slate-500">{note}</span>}
                  </p>
                  <p className="ml-auto text-right">
                    <span className="block font-display text-xl font-bold tabular-nums leading-none">
                      {effStack}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-[#b6b0a2]">
                      chips
                    </span>
                  </p>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ------------------------------------------------ coming up */}
      {table.status === "running" && (
        <div>
          <SectionTitle>Coming up</SectionTitle>
          <Card>
            <p className="text-sm leading-relaxed text-slate-600">
              {table.next_deal_at && hand ? (
                <>
                  <span className="font-display text-base font-semibold uppercase tracking-wide text-slate-900">
                    Hand {hand.handNumber + 1}
                  </span>{" "}
                  deals {fmtDayET(table.next_deal_at)}
                  {handActive ? " — or as soon as this one ends. " : ". "}
                </>
              ) : (
                <>The next hand is being lined up. </>
              )}
              {stepUp ? (
                <>
                  Blinds step up to{" "}
                  <span className="font-semibold text-slate-900">
                    {stepUp.sb} / {stepUp.bb}
                  </span>{" "}
                  at Hand {stepUp.hand}.{" "}
                </>
              ) : (
                <>Blinds are at the cap (25 / 50). </>
              )}
              Winner of the tournament banks{" "}
              <span className="font-semibold text-slate-900">
                {POKER_WINNER_POINTS} lifetime points
              </span>
              .
            </p>
          </Card>
        </div>
      )}

      <Card>
        <SectionTitle>How it works</SectionTitle>
        <p className="text-sm leading-relaxed text-slate-700">
          A hand every couple of days, played one decision at a time. Your first decision of a
          hand gets 8 hours, every one after that 4 — miss the clock and you check if it&rsquo;s
          free, fold if there&rsquo;s a bet. Three misses in one hand and you&rsquo;re folded
          for the rest of it. Blinds climb every three hands, nobody rebuys, and the last stack
          standing wins the table.
        </p>
      </Card>
    </div>
  );
}
