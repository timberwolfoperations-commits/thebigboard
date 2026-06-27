-- ============================================================
-- The Big Board - Site Admin Role
-- ============================================================

CREATE TABLE IF NOT EXISTS public.site_admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_admins_self_read" ON public.site_admins FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "site_admins_admin_read" ON public.site_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "site_admins_admin_insert" ON public.site_admins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "site_admins_admin_delete" ON public.site_admins FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_site_admin_insert" ON public.bracket_matches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_site_admin_update" ON public.bracket_matches FOR UPDATE
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

CREATE POLICY "bracket_admins_site_admin_read" ON public.bracket_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "bracket_admins_site_admin_insert" ON public.bracket_admins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "bracket_admins_site_admin_delete" ON public.bracket_admins FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "memberships_site_admin_read" ON public.group_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "memberships_site_admin_update" ON public.group_memberships FOR UPDATE
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
