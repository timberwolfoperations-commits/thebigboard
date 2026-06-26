-- ============================================================
-- The Big Board – Teams & Bracket Advancement
-- ============================================================

-- 1. teams: master list of tournament teams
CREATE TABLE IF NOT EXISTS public.teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name VARCHAR NOT NULL UNIQUE,
  flag_emoji   VARCHAR NOT NULL DEFAULT '',
  group_seed   VARCHAR
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_group_seed_unique
  ON public.teams (group_seed)
  WHERE group_seed IS NOT NULL;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_public_read" ON public.teams FOR SELECT USING (true);

INSERT INTO public.teams (country_name, flag_emoji, group_seed)
VALUES
  ('Algeria', '🇩🇿', NULL),
  ('Argentina', '🇦🇷', NULL),
  ('Australia', '🇦🇺', NULL),
  ('Austria', '🇦🇹', NULL),
  ('Belgium', '🇧🇪', NULL),
  ('Bosnia and Herzegovina', '🇧🇦', NULL),
  ('Brazil', '🇧🇷', NULL),
  ('Cabo Verde', '🇨🇻', NULL),
  ('Canada', '🇨🇦', NULL),
  ('Colombia', '🇨🇴', NULL),
  ('Congo DR', '🇨🇩', NULL),
  ('Croatia', '🇭🇷', NULL),
  ('Curaçao', '🇨🇼', NULL),
  ('Czechia', '🇨🇿', NULL),
  ('Côte d''Ivoire', '🇨🇮', NULL),
  ('Ecuador', '🇪🇨', NULL),
  ('Egypt', '🇪🇬', NULL),
  ('England', '🏴', NULL),
  ('France', '🇫🇷', NULL),
  ('Germany', '🇩🇪', NULL),
  ('Ghana', '🇬🇭', NULL),
  ('Haiti', '🇭🇹', NULL),
  ('Iran', '🇮🇷', NULL),
  ('Iraq', '🇮🇶', NULL),
  ('Japan', '🇯🇵', NULL),
  ('Jordan', '🇯🇴', NULL),
  ('Korea Republic', '🇰🇷', NULL),
  ('Mexico', '🇲🇽', NULL),
  ('Morocco', '🇲🇦', NULL),
  ('Netherlands', '🇳🇱', NULL),
  ('New Zealand', '🇳🇿', NULL),
  ('Norway', '🇳🇴', NULL),
  ('Panama', '🇵🇦', NULL),
  ('Paraguay', '🇵🇾', NULL),
  ('Portugal', '🇵🇹', NULL),
  ('Qatar', '🇶🇦', NULL),
  ('Saudi Arabia', '🇸🇦', NULL),
  ('Scotland', '🏴', NULL),
  ('Senegal', '🇸🇳', NULL),
  ('South Africa', '🇿🇦', NULL),
  ('Spain', '🇪🇸', NULL),
  ('Sweden', '🇸🇪', NULL),
  ('Switzerland', '🇨🇭', NULL),
  ('Tunisia', '🇹🇳', NULL),
  ('Türkiye', '🇹🇷', NULL),
  ('United States', '🇺🇸', NULL),
  ('Uruguay', '🇺🇾', NULL),
  ('Uzbekistan', '🇺🇿', NULL)
ON CONFLICT (country_name) DO UPDATE
SET
  flag_emoji = EXCLUDED.flag_emoji;

UPDATE public.bracket_matches
SET
  home_team_id = NULL
WHERE home_team_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE teams.id = bracket_matches.home_team_id
  );

UPDATE public.bracket_matches
SET
  away_team_id = NULL
WHERE away_team_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE teams.id = bracket_matches.away_team_id
  );

UPDATE public.bracket_matches
SET
  winning_team_id = NULL
WHERE winning_team_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE teams.id = bracket_matches.winning_team_id
  );

ALTER TABLE public.bracket_matches
  DROP CONSTRAINT IF EXISTS bracket_matches_home_team_id_fkey,
  DROP CONSTRAINT IF EXISTS bracket_matches_away_team_id_fkey,
  DROP CONSTRAINT IF EXISTS bracket_matches_winning_team_id_fkey;

ALTER TABLE public.bracket_matches
  ADD CONSTRAINT bracket_matches_home_team_id_fkey
    FOREIGN KEY (home_team_id) REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD CONSTRAINT bracket_matches_away_team_id_fkey
    FOREIGN KEY (away_team_id) REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD CONSTRAINT bracket_matches_winning_team_id_fkey
    FOREIGN KEY (winning_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.group_seed_to_placeholder(seed TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  group_letter TEXT;
  position_code TEXT;
BEGIN
  IF seed IS NULL OR seed !~ '^[A-Z][12]$' THEN
    RETURN NULL;
  END IF;

  group_letter := LEFT(seed, 1);
  position_code := RIGHT(seed, 1);

  IF position_code = '1' THEN
    RETURN 'Winner Group ' || group_letter;
  END IF;

  RETURN 'Runner-up Group ' || group_letter;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bracket_match_team_slot(
  target_bracket_id UUID,
  target_placeholder TEXT,
  target_slot TEXT,
  target_team_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_placeholder IS NULL THEN
    RETURN;
  END IF;

  IF target_slot = 'home' THEN
    UPDATE public.bracket_matches
    SET
      home_team_id = target_team_id,
      home_score = CASE
        WHEN home_team_id IS DISTINCT FROM target_team_id THEN 0
        ELSE home_score
      END,
      away_score = CASE
        WHEN home_team_id IS DISTINCT FROM target_team_id THEN 0
        ELSE away_score
      END,
      status = CASE
        WHEN home_team_id IS DISTINCT FROM target_team_id THEN 'scheduled'
        ELSE status
      END,
      winning_team_id = CASE
        WHEN home_team_id IS DISTINCT FROM target_team_id THEN NULL
        ELSE winning_team_id
      END
    WHERE (target_bracket_id IS NULL OR bracket_id = target_bracket_id)
      AND home_placeholder = target_placeholder;
  ELSIF target_slot = 'away' THEN
    UPDATE public.bracket_matches
    SET
      away_team_id = target_team_id,
      home_score = CASE
        WHEN away_team_id IS DISTINCT FROM target_team_id THEN 0
        ELSE home_score
      END,
      away_score = CASE
        WHEN away_team_id IS DISTINCT FROM target_team_id THEN 0
        ELSE away_score
      END,
      status = CASE
        WHEN away_team_id IS DISTINCT FROM target_team_id THEN 'scheduled'
        ELSE status
      END,
      winning_team_id = CASE
        WHEN away_team_id IS DISTINCT FROM target_team_id THEN NULL
        ELSE winning_team_id
      END
    WHERE (target_bracket_id IS NULL OR bracket_id = target_bracket_id)
      AND away_placeholder = target_placeholder;
  ELSE
    RAISE EXCEPTION 'Unsupported bracket slot: %', target_slot;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_bracket_match_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'
    AND NEW.home_team_id IS NOT NULL
    AND NEW.away_team_id IS NOT NULL
    AND NEW.home_score <> NEW.away_score THEN
    NEW.winning_team_id := CASE
      WHEN NEW.home_score > NEW.away_score THEN NEW.home_team_id
      ELSE NEW.away_team_id
    END;
  ELSE
    NEW.winning_team_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.propagate_bracket_match_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  winner_team_id UUID;
  loser_team_id UUID;
BEGIN
  winner_team_id := CASE
    WHEN NEW.status = 'completed' THEN NEW.winning_team_id
    ELSE NULL
  END;

  loser_team_id := CASE
    WHEN NEW.status = 'completed'
      AND NEW.winning_team_id IS NOT NULL
      AND NEW.winning_team_id = NEW.home_team_id THEN NEW.away_team_id
    WHEN NEW.status = 'completed'
      AND NEW.winning_team_id IS NOT NULL
      AND NEW.winning_team_id = NEW.away_team_id THEN NEW.home_team_id
    ELSE NULL
  END;

  PERFORM public.set_bracket_match_team_slot(
    NEW.bracket_id,
    'Winner ' || NEW.match_identifier,
    'home',
    winner_team_id
  );
  PERFORM public.set_bracket_match_team_slot(
    NEW.bracket_id,
    'Winner ' || NEW.match_identifier,
    'away',
    winner_team_id
  );
  PERFORM public.set_bracket_match_team_slot(
    NEW.bracket_id,
    'Loser ' || NEW.match_identifier,
    'home',
    loser_team_id
  );
  PERFORM public.set_bracket_match_team_slot(
    NEW.bracket_id,
    'Loser ' || NEW.match_identifier,
    'away',
    loser_team_id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_team_seed_to_matches()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_placeholder TEXT;
  next_placeholder TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.group_seed IS DISTINCT FROM NEW.group_seed THEN
    previous_placeholder := public.group_seed_to_placeholder(OLD.group_seed);

    PERFORM public.set_bracket_match_team_slot(NULL, previous_placeholder, 'home', NULL);
    PERFORM public.set_bracket_match_team_slot(NULL, previous_placeholder, 'away', NULL);
  END IF;

  next_placeholder := public.group_seed_to_placeholder(NEW.group_seed);

  PERFORM public.set_bracket_match_team_slot(NULL, next_placeholder, 'home', NEW.id);
  PERFORM public.set_bracket_match_team_slot(NULL, next_placeholder, 'away', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_bracket_match_result_trigger ON public.bracket_matches;
CREATE TRIGGER normalize_bracket_match_result_trigger
BEFORE INSERT OR UPDATE OF home_team_id, away_team_id, home_score, away_score, status
ON public.bracket_matches
FOR EACH ROW
EXECUTE FUNCTION public.normalize_bracket_match_result();

DROP TRIGGER IF EXISTS propagate_bracket_match_outcome_trigger ON public.bracket_matches;
CREATE TRIGGER propagate_bracket_match_outcome_trigger
AFTER INSERT OR UPDATE OF home_team_id, away_team_id, winning_team_id, status
ON public.bracket_matches
FOR EACH ROW
EXECUTE FUNCTION public.propagate_bracket_match_outcome();

DROP TRIGGER IF EXISTS sync_team_seed_to_matches_trigger ON public.teams;
CREATE TRIGGER sync_team_seed_to_matches_trigger
AFTER INSERT OR UPDATE OF group_seed
ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.sync_team_seed_to_matches();
