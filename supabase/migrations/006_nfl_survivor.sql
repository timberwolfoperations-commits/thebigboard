-- ============================================================
-- The Big Board - NFL Survivor Pool
-- ============================================================

-- Tracks each user's weekly team pick for a survivor game
CREATE TABLE IF NOT EXISTS public.survivor_picks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  week       SMALLINT NOT NULL CHECK (week >= 1 AND week <= 18),
  team       VARCHAR NOT NULL,
  result     VARCHAR NOT NULL DEFAULT 'pending'
             CHECK (result IN ('pending', 'win', 'loss')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_survivor_pick UNIQUE (user_id, game_id, group_id, week)
);

-- Tracks per-game per-group survivor state (current week + eliminated users)
CREATE TABLE IF NOT EXISTS public.survivor_game_state (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  current_week SMALLINT NOT NULL DEFAULT 1 CHECK (current_week >= 1 AND current_week <= 18),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_survivor_state UNIQUE (game_id, group_id)
);

-- ── Row-Level Security ─────────────────────────────────────────

ALTER TABLE public.survivor_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survivor_game_state ENABLE ROW LEVEL SECURITY;

-- Survivor picks: group members can read all picks for their group
CREATE POLICY "survivor_picks_member_read" ON public.survivor_picks FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid()
    )
  );

-- Survivor picks: users can insert/update their own picks
CREATE POLICY "survivor_picks_own_insert" ON public.survivor_picks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "survivor_picks_own_update" ON public.survivor_picks FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Survivor picks: admins (pool admin, site admin) can update result
CREATE POLICY "survivor_picks_admin_update" ON public.survivor_picks FOR UPDATE
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid() AND gm.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.site_admins sa WHERE sa.user_id = auth.uid()
    )
  );

-- Survivor game state: group members can read
CREATE POLICY "survivor_state_member_read" ON public.survivor_game_state FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid()
    )
  );

-- Survivor game state: pool admins and site admins can insert/update
CREATE POLICY "survivor_state_admin_insert" ON public.survivor_game_state FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid() AND gm.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.site_admins sa WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "survivor_state_admin_update" ON public.survivor_game_state FOR UPDATE
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid() AND gm.is_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM public.site_admins sa WHERE sa.user_id = auth.uid()
    )
  );
