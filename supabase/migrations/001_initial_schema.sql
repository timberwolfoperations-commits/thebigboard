-- ============================================================
-- The Big Board – Initial Schema
-- ============================================================

-- 1. brackets: global tournament templates
CREATE TABLE IF NOT EXISTS public.brackets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR NOT NULL UNIQUE,
  display_name  VARCHAR NOT NULL,
  total_rounds  INT NOT NULL,
  lock_deadline TIMESTAMPTZ
);

-- 2. groups: user-created leagues/pools
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  invite_code VARCHAR NOT NULL UNIQUE,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 3. group_bracket_contests: join table – one group runs exactly one instance of a bracket
CREATE TABLE IF NOT EXISTS public.group_bracket_contests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  bracket_id UUID NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
  CONSTRAINT uq_group_bracket UNIQUE (group_id, bracket_id)
);

-- 4. group_memberships: pool entries & ledger
CREATE TABLE IF NOT EXISTS public.group_memberships (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  has_paid BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_group_user UNIQUE (group_id, user_id)
);

-- 5. bracket_matches: global match nodes, results & timing
CREATE TABLE IF NOT EXISTS public.bracket_matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id       UUID NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
  match_identifier VARCHAR NOT NULL,
  round_name       VARCHAR NOT NULL,
  home_placeholder VARCHAR NOT NULL DEFAULT '',
  away_placeholder VARCHAR NOT NULL DEFAULT '',
  home_team_id     UUID REFERENCES auth.users(id),   -- teams table can replace this later
  away_team_id     UUID REFERENCES auth.users(id),
  home_score       INT NOT NULL DEFAULT 0,
  away_score       INT NOT NULL DEFAULT 0,
  status           VARCHAR NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'live', 'completed')),
  winning_team_id  UUID,
  kickoff_time     TIMESTAMPTZ,
  venue            VARCHAR,
  -- CRITICAL: composite unique index used for upsert conflict resolution
  CONSTRAINT uq_bracket_match UNIQUE (bracket_id, match_identifier)
);

-- 6. bracket_user_picks: individual user predictions inside a group
CREATE TABLE IF NOT EXISTS public.bracket_user_picks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id       UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  bracket_id     UUID NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
  match_id       UUID NOT NULL REFERENCES public.bracket_matches(id) ON DELETE CASCADE,
  choice_team_id UUID NOT NULL,
  is_locked      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT uq_user_group_match UNIQUE (user_id, group_id, match_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.brackets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_bracket_contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_matches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_user_picks ENABLE ROW LEVEL SECURITY;

-- brackets: publicly readable, only service role writes
CREATE POLICY "brackets_public_read" ON public.brackets FOR SELECT USING (true);

-- groups: members can read their own groups
CREATE POLICY "groups_member_read" ON public.groups FOR SELECT
  USING (
    id IN (
      SELECT group_id FROM public.group_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "groups_owner_insert" ON public.groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups_owner_update" ON public.groups FOR UPDATE
  USING (created_by = auth.uid());

-- group_bracket_contests: readable by group members
CREATE POLICY "gbc_member_read" ON public.group_bracket_contests FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "gbc_admin_write" ON public.group_bracket_contests FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM public.group_memberships
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- group_memberships: users can read their own memberships
CREATE POLICY "memberships_self_read" ON public.group_memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "memberships_admin_read" ON public.group_memberships FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_memberships
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "memberships_self_insert" ON public.group_memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- bracket_matches: publicly readable
CREATE POLICY "matches_public_read" ON public.bracket_matches FOR SELECT USING (true);

-- bracket_user_picks: users manage their own picks
CREATE POLICY "picks_self_read" ON public.bracket_user_picks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "picks_group_member_read" ON public.bracket_user_picks FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM public.group_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "picks_self_write" ON public.bracket_user_picks FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_locked = false);

CREATE POLICY "picks_self_update" ON public.bracket_user_picks FOR UPDATE
  USING (user_id = auth.uid() AND is_locked = false);

-- ============================================================
-- Seed: World Cup 2026 Knockout bracket template
-- ============================================================

INSERT INTO public.brackets (slug, display_name, total_rounds, lock_deadline)
VALUES (
  'world-cup-2026',
  'World Cup 2026 Knockout',
  4,
  '2026-06-28T00:00:00Z'
) ON CONFLICT (slug) DO NOTHING;
