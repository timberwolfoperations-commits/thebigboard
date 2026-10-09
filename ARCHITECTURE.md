# The Big Board — how the code works

Plain-English tour. If you understand this file, you understand the app.

## The big idea (data model)

Five tables. That's it.

| Table | What it is, in English |
|---|---|
| `profiles` | One row per person. Name + photo come from Google automatically. |
| `groups` | A friend circle, e.g. "HS friends". Has a secret invite link. |
| `group_members` | Who's in which group, and who's an `admin`. |
| `bets` | A bet: title, points, settle date, status, and *who's proposed as winner*. |
| `bet_participants` | Who's actually competing in a bet + whether they've approved the result. |

The key design decision: **groups are the audience, bets have their own guest
list.** The whole group sees every bet (shit-talk enabled), but only
`bet_participants` are on the hook. That's what lets you bet Danny 1-on-1
inside the HS friends group without everyone competing.

**Points are not money and not currency.** Nobody's points ever decrease, and
points never move between people. When you win a 25-point bet, 25 gets added
to your lifetime tally. The leaderboard just adds up settled bets. There's no
wallet, no transfers, nothing to cash out — by design.

## The bet lifecycle (statuses)

```
open → awaiting → settled
  ↓        ↓
 void    disputed → settled (admin resolves)
```

- **open** — the bet is live. Created with a title, points, settle date, and
  2+ participants.
- **awaiting** — someone proposed a winner; collecting approvals. The
  proposer's own approval is automatic.
- **settled** — every participant approved (or the 7-day auto-settle fired, or
  an admin force-settled). Winner's lifetime points go up.
- **disputed** — someone hit "that's not right". Off the deadbeat board until
  an admin picks the winner.
- **void** — admin cancelled it. Doesn't count.

Two timers run the social pressure, both checked lazily when anyone opens the
group page (no cron job to babysit):

- **3 days past settle date** → still not settled? Onto the **Deadbeat Board**,
  naming exactly who's holding it up (whoever hasn't approved — or everyone,
  if nobody even proposed).
- **7 days past settle date** → an undisputed proposal auto-settles as
  proposed. No proposal at all? Stays overdue; an admin can force-settle.

## Login (why it's not scary)

There is **zero custom login code** in this app. The entire flow:

1. You click "Sign in with Google".
2. Google confirms it's you and sends you back to `/auth/callback`.
3. Supabase hands the browser a session cookie. Done.

The `middleware.ts` file just keeps that cookie fresh. `lib/supabase/server.ts`
reads it so every database query runs *as you*. That's the whole auth system —
if login ever breaks, it's a config issue in the Supabase dashboard, not a code
issue.

## Permissions (the part that got confusing last time)

Last codebase had **three** different login/admin systems fighting each other.
This one has **one rule**:

> **The database checks everything, every time.** Each query runs as the
> signed-in user, and Row Level Security policies decide what's allowed.

In practice:

- You can only **see** groups you're a member of, and bets inside them.
- You can only flip **your own approval** (well: any participant can flip
  approval switches *within their own bet* — proposing a winner resets
  everyone's switch, which is why).
- Creating/joining a group goes through two special database functions
  (`create_group`, `join_group_by_token`) because at that moment you're *not
  yet a member*, so the normal rules can't authorize you.

**Why the weird `is_group_member()` functions?** This is the fix for the bug
that ate your last codebase (the "infinite recursion" PR). A security rule is
not allowed to ask a question whose answer depends on the rule itself — that's
the recursion. So all membership checks funnel through tiny functions that run
*as the database owner*, bypassing the rules just for that one check. If
you're ever tempted to write a policy that queries `group_members` directly:
don't. Call the function.

**Admins** are just group members with `role = 'admin'` (the group creator).
They can force-settle, void, and resolve disputes. That's the entire admin
system — no separate admin login, no secret header keys.

## Where things live (files)

```
app/page.tsx                    Landing page ("Sign in with Google")
app/dashboard/page.tsx          Your groups + create/join
app/groups/[id]/page.tsx        Group home: bets, deadbeats, leaderboard
app/groups/[id]/bets/new/       Bet creation form
app/groups/[id]/bets/[betId]/   Bet detail: propose, approve, dispute
app/join/[token]/page.tsx       Invite link landing ("Yes, I'm in")
app/auth/callback/route.ts      Google sends you back here after sign-in

lib/actions.ts                  EVERYTHING the app can do (the whole rulebook)
lib/supabase/{client,server,    Supabase connections (browser / server / session refresh)
  middleware}.ts
middleware.ts                   Keeps you signed in
components/ui.tsx               Buttons, cards, badges (the only styling file)
components/AuthButtons.tsx      Sign in / sign out buttons

supabase/migrations/            The database. One file. Run it once.
```

**The most important file is `lib/actions.ts`.** Every button in the app calls
exactly one function there. If you want to know "what happens when someone
approves?", read `approveSettlement` — it's ~20 lines. New features go there
first, UI second.

## The simplicity contract (for future AI help)

Paste this into any AI coding prompt for this repo:

> This is The Big Board, a simple friend-group bet tracker. v1 scope: Google
> login, groups, custom bets with per-bet participants, dual/multi-approval
> settlement, lifetime points leaderboard, deadbeat board. Explicitly OUT of
> scope: money, payments, wallets, point transfers, comments/chat, sports data
> integrations, email notifications. Do not add tables, auth systems, or
> abstractions. Do not refactor working code for style. Smallest change that
> satisfies the request.
