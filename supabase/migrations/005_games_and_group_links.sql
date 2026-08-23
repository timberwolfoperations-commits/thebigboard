-- ============================================================
-- The Big Board - Site Managed Games
-- ============================================================

CREATE TABLE IF NOT EXISTS public.games (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR NOT NULL UNIQUE,
  display_name  VARCHAR NOT NULL,
  game_type     VARCHAR NOT NULL DEFAULT 'bracket'
                CHECK (game_type IN ('bracket', 'nfl_survivor')),
  status        VARCHAR NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  bracket_id    UUID REFERENCES public.brackets(id) ON DELETE SET NULL,
  lock_deadline TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_games (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  game_id  UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  CONSTRAINT uq_group_game UNIQUE (group_id, game_id)
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_public_read" ON public.games FOR SELECT USING (true);

CREATE POLICY "games_site_admin_insert" ON public.games FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "games_site_admin_update" ON public.games FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "games_site_admin_delete" ON public.games FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "group_games_member_read" ON public.group_games FOR SELECT
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "group_games_group_admin_insert" ON public.group_games FOR INSERT
  WITH CHECK (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid() AND gm.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "group_games_group_admin_delete" ON public.group_games FOR DELETE
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid() AND gm.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

INSERT INTO public.games (
  slug,
  display_name,
  game_type,
  status,
  bracket_id,
  lock_deadline,
  created_by
)
SELECT
  b.slug,
  b.display_name,
  'bracket',
  'active',
  b.id,
  b.lock_deadline,
  NULL
FROM public.brackets b
ON CONFLICT (slug) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  game_type = EXCLUDED.game_type,
  status = EXCLUDED.status,
  bracket_id = EXCLUDED.bracket_id,
  lock_deadline = EXCLUDED.lock_deadline;

INSERT INTO public.group_games (group_id, game_id)
SELECT
  gbc.group_id,
  g.id
FROM public.group_bracket_contests gbc
JOIN public.games g
  ON g.bracket_id = gbc.bracket_id
 AND g.game_type = 'bracket'
ON CONFLICT (group_id, game_id) DO NOTHING;
