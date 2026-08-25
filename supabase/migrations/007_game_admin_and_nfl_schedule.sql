-- ============================================================
-- The Big Board - General Game Admin & Shared NFL Schedule
-- ============================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS current_week SMALLINT NOT NULL DEFAULT 1
    CHECK (current_week >= 1 AND current_week <= 18),
  ADD COLUMN IF NOT EXISTS season_year INT;

UPDATE public.games
SET season_year = EXTRACT(YEAR FROM now())::INT
WHERE game_type = 'nfl_survivor'
  AND season_year IS NULL;

CREATE TABLE IF NOT EXISTS public.nfl_matchups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year  INT NOT NULL,
  week         SMALLINT NOT NULL CHECK (week >= 1 AND week <= 18),
  home_team    VARCHAR NOT NULL,
  away_team    VARCHAR NOT NULL,
  kickoff_time TIMESTAMPTZ,
  status       VARCHAR NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'completed')),
  winning_team VARCHAR,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_nfl_matchup UNIQUE (season_year, week, home_team, away_team),
  CONSTRAINT chk_nfl_matchup_teams_distinct CHECK (home_team <> away_team),
  CONSTRAINT chk_nfl_matchup_winner CHECK (
    winning_team IS NULL OR winning_team = home_team OR winning_team = away_team
  )
);

ALTER TABLE public.nfl_matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfl_matchups_public_read" ON public.nfl_matchups FOR SELECT
  USING (true);

CREATE POLICY "nfl_matchups_site_admin_insert" ON public.nfl_matchups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE POLICY "nfl_matchups_site_admin_update" ON public.nfl_matchups FOR UPDATE
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

CREATE POLICY "nfl_matchups_site_admin_delete" ON public.nfl_matchups FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.site_admins sa
      WHERE sa.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.join_group_by_invite(invite TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_group_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT g.id
  INTO target_group_id
  FROM public.groups g
  WHERE UPPER(g.invite_code) = UPPER(invite)
  LIMIT 1;

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION 'Invite code not found';
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, has_paid, is_admin)
  VALUES (target_group_id, auth.uid(), false, false)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN target_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_nfl_week_results(target_game_id UUID, target_week SMALLINT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_season INT;
  updated_rows INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.site_admins sa
    WHERE sa.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Site admin access required';
  END IF;

  SELECT g.season_year
  INTO target_season
  FROM public.games g
  WHERE g.id = target_game_id;

  IF target_season IS NULL THEN
    RAISE EXCEPTION 'Game season is not configured';
  END IF;

  UPDATE public.survivor_picks sp
  SET result = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.nfl_matchups nm
      WHERE nm.season_year = target_season
        AND nm.week = target_week
        AND nm.status = 'completed'
        AND nm.winning_team = sp.team
    ) THEN 'win'
    WHEN EXISTS (
      SELECT 1
      FROM public.nfl_matchups nm
      WHERE nm.season_year = target_season
        AND nm.week = target_week
        AND nm.status = 'completed'
        AND (nm.home_team = sp.team OR nm.away_team = sp.team)
        AND nm.winning_team IS NOT NULL
        AND nm.winning_team <> sp.team
    ) THEN 'loss'
    ELSE 'pending'
  END
  WHERE sp.game_id = target_game_id
    AND sp.week = target_week;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group_by_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_nfl_week_results(UUID, SMALLINT) TO authenticated;
