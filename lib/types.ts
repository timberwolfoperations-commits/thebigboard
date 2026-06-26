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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Bracket = Database['public']['Tables']['brackets']['Row']
export type Group = Database['public']['Tables']['groups']['Row']
export type GroupBracketContest = Database['public']['Tables']['group_bracket_contests']['Row']
export type GroupMembership = Database['public']['Tables']['group_memberships']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type BracketMatch = Database['public']['Tables']['bracket_matches']['Row']
export type BracketUserPick = Database['public']['Tables']['bracket_user_picks']['Row']
