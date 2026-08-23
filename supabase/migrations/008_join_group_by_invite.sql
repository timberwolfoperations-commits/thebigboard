-- ============================================================
-- Add secure join-by-invite flow
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_group_by_invite(invite_code_input text)
  RETURNS TABLE (
    group_id uuid,
    group_name varchar,
    game_slug varchar
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a pool.';
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, is_admin, has_paid)
  SELECT g.id, current_user_id, false, false
  FROM public.groups g
  WHERE upper(g.invite_code) = upper(trim(invite_code_input))
  ON CONFLICT (group_id, user_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE upper(g.invite_code) = upper(trim(invite_code_input))
  ) THEN
    RAISE EXCEPTION 'Invite code not found.';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.name,
    (
      SELECT gm.slug
      FROM public.group_games gg
      JOIN public.games gm
        ON gm.id = gg.game_id
      WHERE gg.group_id = g.id
      ORDER BY gm.created_at ASC, gm.display_name ASC
      LIMIT 1
    ) AS game_slug
  FROM public.groups g
  WHERE upper(g.invite_code) = upper(trim(invite_code_input))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group_by_invite(text) TO authenticated;
