export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          accuracy_m: number | null
          anomaly_flags: Json
          device_fingerprint: string | null
          event_type: Database["public"]["Enums"]["punch_event_type"]
          geofence_status: Database["public"]["Enums"]["geofence_status"] | null
          id: string
          ip_address: string | null
          lat: number | null
          lng: number | null
          mock_flag: boolean
          selfie_path: string | null
          ts_utc: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          anomaly_flags?: Json
          device_fingerprint?: string | null
          event_type: Database["public"]["Enums"]["punch_event_type"]
          geofence_status?:
            | Database["public"]["Enums"]["geofence_status"]
            | null
          id?: string
          ip_address?: string | null
          lat?: number | null
          lng?: number | null
          mock_flag?: boolean
          selfie_path?: string | null
          ts_utc?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          anomaly_flags?: Json
          device_fingerprint?: string | null
          event_type?: Database["public"]["Enums"]["punch_event_type"]
          geofence_status?:
            | Database["public"]["Enums"]["geofence_status"]
            | null
          id?: string
          ip_address?: string | null
          lat?: number | null
          lng?: number | null
          mock_flag?: boolean
          selfie_path?: string | null
          ts_utc?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          id: string
          payload: Json
          target: string | null
          ts: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: string
          payload?: Json
          target?: string | null
          ts?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: string
          payload?: Json
          target?: string | null
          ts?: string
        }
        Relationships: []
      }
      employee_config: {
        Row: {
          home_lat: number | null
          home_lng: number | null
          home_radius_m: number
          office_lat: number | null
          office_lng: number | null
          office_radius_m: number
          updated_at: string
          user_id: string
          weekly_schedule: Json
        }
        Insert: {
          home_lat?: number | null
          home_lng?: number | null
          home_radius_m?: number
          office_lat?: number | null
          office_lng?: number | null
          office_radius_m?: number
          updated_at?: string
          user_id: string
          weekly_schedule?: Json
        }
        Update: {
          home_lat?: number | null
          home_lng?: number | null
          home_radius_m?: number
          office_lat?: number | null
          office_lng?: number | null
          office_radius_m?: number
          updated_at?: string
          user_id?: string
          weekly_schedule?: Json
        }
        Relationships: []
      }
      pending_devices: {
        Row: {
          fingerprint: string
          id: string
          requested_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          fingerprint: string
          id?: string
          requested_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          fingerprint?: string
          id?: string
          requested_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          fingerprint: string
          id: string
          label: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          fingerprint: string
          id?: string
          label?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          fingerprint?: string
          id?: string
          label?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "hr_admin"
        | "account_manager"
        | "reporting_manager"
        | "employee"
      geofence_status: "inside_office" | "inside_home" | "outside" | "no_config"
      punch_event_type: "punch_in" | "punch_out"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "hr_admin",
        "account_manager",
        "reporting_manager",
        "employee",
      ],
      geofence_status: ["inside_office", "inside_home", "outside", "no_config"],
      punch_event_type: ["punch_in", "punch_out"],
    },
  },
} as const
