# 🏆 The Big Board

Friendly bets, settled properly. The unbreakable contract for friend groups.

Make a bet with anyone in your group — steps challenge, World Series pick,
whatever. The bet is written down where everyone can see it, both sides sign
off on the winner, and points live on the leaderboard forever. People who
won't settle up land on the **Deadbeat Board**.

**No money touches this app.** Points are bragging rights, not currency.

## Tech

- Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- Supabase: Postgres + Auth (Google OAuth) + Row Level Security
- No custom auth code. No payment code. On purpose.

## Setup

### 1. Install

```bash
npm install
cp .env.local.example .env.local
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com) → new project. Then open the SQL
editor and run `supabase/migrations/001_big_board.sql` once. That's the whole
database: 5 tables, Row Level Security, and a few helper functions.

### 3. Enable Google sign-in

This is config, not code — Supabase already implemented OAuth:

1. [Google Cloud Console](https://console.cloud.google.com) → create a project
   (or reuse one) → **APIs & Services → Credentials** → **Create Credentials →
   OAuth client ID** (Web application).
2. Under **Authorized redirect URIs**, add:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. In Supabase: **Authentication → Providers → Google** → enable, paste the
   client ID + secret.
4. Add your site URL under **Authentication → URL Configuration** (e.g.
   `http://localhost:3000` for dev, your Vercel URL for prod).

### 4. Environment variables

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> ⚠️ **Never commit `.env.local`.** It's in `.gitignore` — keep it that way.
> The anon key is public by design; the service-role key should never be
> needed by this app at all. If a secret ever leaks, rotate it in the
> Supabase dashboard.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works (the 30-second version)

1. **Groups** are the audience — e.g. "HS friends". Everyone in the group sees
   every bet (that's the shit-talk layer).
2. **Bets** have their own participant list — bet Danny 1-on-1, or Danny +
   Adam, without the whole group competing.
3. When the settle date passes, someone **proposes the winner**. Every
   participant approves → bet settles, winner gets the points on the
   **lifetime leaderboard**.
4. Someone won't sign off? After a 3-day grace period the bet lands on the
   **Deadbeat Board**, naming who's holding it up. After 7 days an undisputed
   proposal auto-settles. Disputes go to a group admin.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the plain-English tour of the code.

## Deploy

Vercel: import the repo, add the two env vars, done. Then add your production
URL in Supabase **Authentication → URL Configuration** so Google sign-in
redirects correctly.
