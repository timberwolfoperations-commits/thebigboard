-- ============================================================
-- Fix: infinite recursion in site_admins RLS policies
--
-- The policies "site_admins_admin_read/insert/delete" queried
-- public.site_admins from within a policy ON public.site_admins,
-- causing PostgreSQL to recurse infinitely.
--
-- Solution: a SECURITY DEFINER function that reads site_admins
-- without triggering RLS, used as the policy predicate.
-- ============================================================

-- Helper function: returns true when the calling user is a site admin.
-- SECURITY DEFINER means it runs as the function owner (postgres/service
-- role) and therefore bypasses RLS on site_admins, breaking the cycle.
CREATE OR REPLACE FUNCTION public.is_site_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_admins
    WHERE user_id = auth.uid()
  );
$$;

-- Grant execute to authenticated users so policies can call it.
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;

-- -------------------------------------------------------
-- Replace the recursive policies on public.site_admins
-- -------------------------------------------------------

DROP POLICY IF EXISTS "site_admins_admin_read"   ON public.site_admins;
DROP POLICY IF EXISTS "site_admins_admin_insert" ON public.site_admins;
DROP POLICY IF EXISTS "site_admins_admin_delete" ON public.site_admins;

-- Admins can read all rows (no recursion: is_site_admin() uses SECURITY DEFINER)
CREATE POLICY "site_admins_admin_read" ON public.site_admins FOR SELECT
  USING (public.is_site_admin());

-- Admins can insert new admins
CREATE POLICY "site_admins_admin_insert" ON public.site_admins FOR INSERT
  WITH CHECK (public.is_site_admin());

-- Admins can delete admins
CREATE POLICY "site_admins_admin_delete" ON public.site_admins FOR DELETE
  USING (public.is_site_admin());
