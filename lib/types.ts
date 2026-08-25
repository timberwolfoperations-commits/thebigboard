export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      brackets: {
        Row: {
          id: string
          slug: string
          display_name: string
          total_rounds: number
          lock_deadline: string | null
        }
        Insert: {
          id?: string
          slug: string
          display_name: string
          total_rounds: number
          lock_deadline?: string | null
        }
        Update: {
          id?: string
          slug?: string
          display_name?: string
          total_rounds?: number
          lock_deadline?: string | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          invite_code: string
          created_by: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          created_by: string
        }
        Update: {
          id?: string
          name?: string
          invite_code?: string
          created_by?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          id: string
          slug: string
          display_name: string
          game_type: 'bracket' | 'nfl_survivor'
          status: 'draft' | 'active' | 'closed' | 'archived'
          bracket_id: string | null
          lock_deadline: string | null
          current_week: number
          season_year: number | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          display_name: string
          game_type?: 'bracket' | 'nfl_survivor'
          status?: 'draft' | 'active' | 'closed' | 'archived'
          bracket_id?: string | null
          lock_deadline?: string | null
          current_week?: number
          season_year?: number | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          display_name?: string
          game_type?: 'bracket' | 'nfl_survivor'
          status?: 'draft' | 'active' | 'closed' | 'archived'
          bracket_id?: string | null
          lock_deadline?: string | null
          current_week?: number
          season_year?: number | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      bracket_admins: {
        Row: {
          id: string
          bracket_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          bracket_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          bracket_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      site_admins: {
        Row: {
          id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      group_bracket_contests: {
        Row: {
          id: string
          group_id: string
          bracket_id: string
        }
        Insert: {
          id?: string
          group_id: string
          bracket_id: string
        }
        Update: {
          id?: string
          group_id?: string
          bracket_id?: string
        }
        Relationships: []
      }
      group_games: {
        Row: {
          id: string
          group_id: string
          game_id: string
        }
        Insert: {
          id?: string
          group_id: string
          game_id: string
        }
        Update: {
          id?: string
          group_id?: string
          game_id?: string
        }
        Relationships: []
      }
      group_memberships: {
        Row: {
          id: string
          group_id: string
          user_id: string
          has_paid: boolean
          is_admin: boolean
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          has_paid?: boolean
          is_admin?: boolean
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          has_paid?: boolean
          is_admin?: boolean
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          country_name: string
          flag_emoji: string
          group_seed: string | null
        }
        Insert: {
          id?: string
          country_name: string
          flag_emoji?: string
          group_seed?: string | null
        }
        Update: {
          id?: string
          country_name?: string
          flag_emoji?: string
          group_seed?: string | null
        }
        Relationships: []
      }
      bracket_matches: {
        Row: {
          id: string
          bracket_id: string
          match_identifier: string
          round_name: string
          home_placeholder: string
          away_placeholder: string
          home_team_id: string | null
          away_team_id: string | null
          home_score: number
          away_score: number
          status: 'scheduled' | 'live' | 'completed'
          winning_team_id: string | null
          kickoff_time: string | null
          venue: string | null
        }
        Insert: {
          id?: string
          bracket_id: string
          match_identifier: string
          round_name: string
          home_placeholder?: string
          away_placeholder?: string
          home_team_id?: string | null
          away_team_id?: string | null
          home_score?: number
          away_score?: number
          status?: 'scheduled' | 'live' | 'completed'
          winning_team_id?: string | null
          kickoff_time?: string | null
          venue?: string | null
        }
        Update: {
          id?: string
          bracket_id?: string
          match_identifier?: string
          round_name?: string
          home_placeholder?: string
          away_placeholder?: string
          home_team_id?: string | null
          away_team_id?: string | null
          home_score?: number
          away_score?: number
          status?: 'scheduled' | 'live' | 'completed'
          winning_team_id?: string | null
          kickoff_time?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      bracket_user_picks: {
        Row: {
          id: string
          user_id: string
          group_id: string
          bracket_id: string
          match_id: string
          choice_team_id: string
          is_locked: boolean
        }
        Insert: {
          id?: string
          user_id: string
          group_id: string
          bracket_id: string
          match_id: string
          choice_team_id: string
          is_locked?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          group_id?: string
          bracket_id?: string
          match_id?: string
          choice_team_id?: string
          is_locked?: boolean
        }
        Relationships: []
      }
      survivor_picks: {
        Row: {
          id: string
          user_id: string
          game_id: string
          group_id: string
          week: number
          team: string
          result: 'pending' | 'win' | 'loss'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          game_id: string
          group_id: string
          week: number
          team: string
          result?: 'pending' | 'win' | 'loss'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          game_id?: string
          group_id?: string
          week?: number
          team?: string
          result?: 'pending' | 'win' | 'loss'
          created_at?: string
        }
        Relationships: []
      }
      survivor_game_state: {
        Row: {
          id: string
          game_id: string
          group_id: string
          current_week: number
          updated_at: string
        }
        Insert: {
          id?: string
          game_id: string
          group_id: string
          current_week?: number
          updated_at?: string
        }
        Update: {
          id?: string
          game_id?: string
          group_id?: string
          current_week?: number
          updated_at?: string
        }
        Relationships: []
      }
      nfl_matchups: {
        Row: {
          id: string
          season_year: number
          week: number
          home_team: string
          away_team: string
          kickoff_time: string | null
          status: 'scheduled' | 'completed'
          winning_team: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_year: number
          week: number
          home_team: string
          away_team: string
          kickoff_time?: string | null
          status?: 'scheduled' | 'completed'
          winning_team?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_year?: number
          week?: number
          home_team?: string
          away_team?: string
          kickoff_time?: string | null
          status?: 'scheduled' | 'completed'
          winning_team?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      apply_nfl_week_results: {
        Args: {
          target_game_id: string
          target_week: number
        }
        Returns: number
      }
      join_group_by_invite: {
        Args: {
          invite: string
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Bracket = Database['public']['Tables']['brackets']['Row']
export type Group = Database['public']['Tables']['groups']['Row']
export type Game = Database['public']['Tables']['games']['Row']
export type BracketAdmin = Database['public']['Tables']['bracket_admins']['Row']
export type SiteAdmin = Database['public']['Tables']['site_admins']['Row']
export type GroupBracketContest = Database['public']['Tables']['group_bracket_contests']['Row']
export type GroupGame = Database['public']['Tables']['group_games']['Row']
export type GroupMembership = Database['public']['Tables']['group_memberships']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type BracketMatch = Database['public']['Tables']['bracket_matches']['Row']
export type BracketUserPick = Database['public']['Tables']['bracket_user_picks']['Row']
export type SurvivorPick = Database['public']['Tables']['survivor_picks']['Row']
export type SurvivorGameState = Database['public']['Tables']['survivor_game_state']['Row']
export type NflMatchup = Database['public']['Tables']['nfl_matchups']['Row']
