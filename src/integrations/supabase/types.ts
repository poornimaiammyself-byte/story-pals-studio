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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          appearance: string
          clothing: string
          created_at: string
          description: string
          id: string
          name: string
          personality: string
          reference_image_path: string | null
          role: string
          user_id: string
          voice_id: string
        }
        Insert: {
          appearance?: string
          clothing?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          personality?: string
          reference_image_path?: string | null
          role?: string
          user_id: string
          voice_id?: string
        }
        Update: {
          appearance?: string
          clothing?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          personality?: string
          reference_image_path?: string | null
          role?: string
          user_id?: string
          voice_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          age_range: string
          aspect_ratio: string
          character_ids: string[]
          concept: string
          created_at: string
          duration_seconds: number
          final_video_path: string | null
          id: string
          language: string
          last_error: string | null
          music_path: string | null
          music_prompt: string | null
          music_status: string
          music_volume: number
          objective: string
          pipeline: Json
          render_status: string
          script: Json | null
          title: string
          updated_at: string
          user_id: string
          visual_style: string
        }
        Insert: {
          age_range?: string
          aspect_ratio?: string
          character_ids?: string[]
          concept?: string
          created_at?: string
          duration_seconds?: number
          final_video_path?: string | null
          id?: string
          language?: string
          last_error?: string | null
          music_path?: string | null
          music_prompt?: string | null
          music_status?: string
          music_volume?: number
          objective?: string
          pipeline?: Json
          render_status?: string
          script?: Json | null
          title: string
          updated_at?: string
          user_id: string
          visual_style?: string
        }
        Update: {
          age_range?: string
          aspect_ratio?: string
          character_ids?: string[]
          concept?: string
          created_at?: string
          duration_seconds?: number
          final_video_path?: string | null
          id?: string
          language?: string
          last_error?: string | null
          music_path?: string | null
          music_prompt?: string | null
          music_status?: string
          music_volume?: number
          objective?: string
          pipeline?: Json
          render_status?: string
          script?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          visual_style?: string
        }
        Relationships: []
      }
      scene_audio: {
        Row: {
          audio_path: string | null
          created_at: string
          duration: number
          id: string
          line_index: number
          project_id: string
          scene_id: string
          speaker: string
          text: string
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          duration?: number
          id?: string
          line_index: number
          project_id: string
          scene_id: string
          speaker: string
          text: string
          user_id: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          duration?: number
          id?: string
          line_index?: number
          project_id?: string
          scene_id?: string
          speaker?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_audio_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_audio_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          action: string
          animation_mode: string
          audio_duration: number
          captions: Json
          characters: string[]
          created_at: string
          dialogue: Json
          id: string
          image_path: string | null
          image_prompt: string
          location: string
          narration: string
          project_id: string
          scene_index: number
          status: Json
          user_id: string
          video_path: string | null
        }
        Insert: {
          action?: string
          animation_mode?: string
          audio_duration?: number
          captions?: Json
          characters?: string[]
          created_at?: string
          dialogue?: Json
          id?: string
          image_path?: string | null
          image_prompt?: string
          location?: string
          narration?: string
          project_id: string
          scene_index: number
          status?: Json
          user_id: string
          video_path?: string | null
        }
        Update: {
          action?: string
          animation_mode?: string
          audio_duration?: number
          captions?: Json
          characters?: string[]
          created_at?: string
          dialogue?: Json
          id?: string
          image_path?: string | null
          image_prompt?: string
          location?: string
          narration?: string
          project_id?: string
          scene_index?: number
          status?: Json
          user_id?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
