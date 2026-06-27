-- ============================================================
-- The Big Board – Bracket Admins & Updated Lock Deadline
-- ============================================================

-- Bracket-level admins can manage official outcomes across all groups.
CREATE TABLE IF NOT EXISTS public.bracket_admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_id UUID NOT NULL REFERENCES public.brackets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_bracket_admin UNIQUE (bracket_id, user_id)
);

ALTER TABLE public.bracket_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bracket_admins_self_read" ON public.bracket_admins FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "bracket_admins_bracket_read" ON public.bracket_admins FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_admins.bracket_id
        AND ba.user_id = auth.uid()
    )
  );

CREATE POLICY "bracket_admins_bracket_insert" ON public.bracket_admins FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_admins.bracket_id
        AND ba.user_id = auth.uid()
    )
  );

CREATE POLICY "bracket_admins_bracket_delete" ON public.bracket_admins FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_admins.bracket_id
        AND ba.user_id = auth.uid()
    )
  );

-- Allow bracket admins to insert and update official match records.
CREATE POLICY "matches_bracket_admin_insert" ON public.bracket_matches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_matches.bracket_id
        AND ba.user_id = auth.uid()
    )
  );

CREATE POLICY "matches_bracket_admin_update" ON public.bracket_matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_matches.bracket_id
        AND ba.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bracket_admins ba
      WHERE ba.bracket_id = bracket_matches.bracket_id
        AND ba.user_id = auth.uid()
    )
  );

CREATE POLICY "memberships_group_admin_update" ON public.group_memberships FOR UPDATE
  USING (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid()
        AND gm.is_admin = true
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT gm.group_id
      FROM public.group_memberships gm
      WHERE gm.user_id = auth.uid()
        AND gm.is_admin = true
    )
  );

-- Update World Cup bracket lock to Sunday, June 28 at 11:00 PM UTC.
UPDATE public.brackets
SET lock_deadline = '2026-06-28T23:00:00Z'
WHERE slug = 'world-cup-2026';
