-- ============================================================
-- Fix: infinite recursion in site_admins RLS policies
--
-- The original "site_admins_admin_read/insert/delete" policies
-- queried site_admins FROM WITHIN a site_admins policy, causing
-- infinite recursion. Replace them with a SECURITY DEFINER
-- helper function that bypasses RLS when checking admin status.
-- ============================================================

-- Drop the recursive policies
DROP POLICY IF EXISTS "site_admins_admin_read"   ON public.site_admins;
DROP POLICY IF EXISTS "site_admins_admin_insert" ON public.site_admins;
DROP POLICY IF EXISTS "site_admins_admin_delete" ON public.site_admins;

-- Create a security-definer function to check admin status without
-- triggering RLS on site_admins (avoids the recursive loop).
CREATE OR REPLACE FUNCTION public.is_site_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_admins WHERE user_id = uid
  );
$$;

-- Re-create the non-recursive policies using the helper function
CREATE POLICY "site_admins_admin_read" ON public.site_admins FOR SELECT
  USING (public.is_site_admin(auth.uid()));

CREATE POLICY "site_admins_admin_insert" ON public.site_admins FOR INSERT
  WITH CHECK (public.is_site_admin(auth.uid()));

CREATE POLICY "site_admins_admin_delete" ON public.site_admins FOR DELETE
  USING (public.is_site_admin(auth.uid()));
