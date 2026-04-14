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
      classifications: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          default_ot_rate: number
          default_reg_rate: number
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          default_ot_rate?: number
          default_reg_rate?: number
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          default_ot_rate?: number
          default_reg_rate?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "classifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          email_enabled: boolean
          in_app_enabled: boolean
          key: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          key: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          in_app_enabled?: boolean
          key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          company_id: string
          recipient_id: string
          ticket_id: string | null
          kind: string
          title: string
          body: string | null
          read: boolean
          dismissed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          recipient_id: string
          ticket_id?: string | null
          kind: string
          title: string
          body?: string | null
          read?: boolean
          dismissed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          recipient_id?: string
          ticket_id?: string | null
          kind?: string
          title?: string
          body?: string | null
          read?: boolean
          dismissed?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          classification_id: string | null
          company_id: string
          created_at: string
          default_vehicle_id: string | null
          email: string
          first_name: string
          id: string
          is_readonly_admin: boolean
          last_name: string
          notification_on_return: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          classification_id?: string | null
          company_id: string
          created_at?: string
          default_vehicle_id?: string | null
          email: string
          first_name?: string
          id: string
          is_readonly_admin?: boolean
          last_name?: string
          notification_on_return?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          classification_id?: string | null
          company_id?: string
          created_at?: string
          default_vehicle_id?: string | null
          email?: string
          first_name?: string
          id?: string
          is_readonly_admin?: boolean
          last_name?: string
          notification_on_return?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_vehicle_id_fkey"
            columns: ["default_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_name: string | null
          diff: Json | null
          id: string
          note: string | null
          occurred_at: string
          ticket_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          diff?: Json | null
          id?: string
          note?: string | null
          occurred_at?: string
          ticket_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          diff?: Json | null
          id?: string
          note?: string | null
          occurred_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_audit_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_equipment: {
        Row: {
          equip_number: string | null
          hours: number | null
          id: string
          rate: number | null
          sort_order: number
          ticket_id: string
          total: number | null
        }
        Insert: {
          equip_number?: string | null
          hours?: number | null
          id?: string
          rate?: number | null
          sort_order?: number
          ticket_id: string
          total?: number | null
        }
        Update: {
          equip_number?: string | null
          hours?: number | null
          id?: string
          rate?: number | null
          sort_order?: number
          ticket_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_equipment_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_exports: {
        Row: {
          file_url: string
          format: Database["public"]["Enums"]["export_format"]
          generated_at: string
          generated_by: string
          id: string
          is_stale: boolean
          ticket_id: string
        }
        Insert: {
          file_url: string
          format: Database["public"]["Enums"]["export_format"]
          generated_at?: string
          generated_by: string
          id?: string
          is_stale?: boolean
          ticket_id: string
        }
        Update: {
          file_url?: string
          format?: Database["public"]["Enums"]["export_format"]
          generated_at?: string
          generated_by?: string
          id?: string
          is_stale?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_exports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_exports_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_labor: {
        Row: {
          classification_snapshot: string | null
          end_time: string | null
          first_name: string
          hours: number | null
          id: string
          last_name: string
          ot_hours: number | null
          ot_rate: number | null
          ot_total: number | null
          reg_hours: number | null
          reg_rate: number | null
          reg_total: number | null
          row_total: number | null
          sort_order: number
          start_time: string | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          classification_snapshot?: string | null
          end_time?: string | null
          first_name?: string
          hours?: number | null
          id?: string
          last_name?: string
          ot_hours?: number | null
          ot_rate?: number | null
          ot_total?: number | null
          reg_hours?: number | null
          reg_rate?: number | null
          reg_total?: number | null
          row_total?: number | null
          sort_order?: number
          start_time?: string | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          classification_snapshot?: string | null
          end_time?: string | null
          first_name?: string
          hours?: number | null
          id?: string
          last_name?: string
          ot_hours?: number | null
          ot_rate?: number | null
          ot_total?: number | null
          reg_hours?: number | null
          reg_rate?: number | null
          reg_total?: number | null
          row_total?: number | null
          sort_order?: number
          start_time?: string | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_labor_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_labor_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_materials: {
        Row: {
          description: string | null
          id: string
          part_number: string | null
          price_each: number | null
          qty: number
          sort_order: number
          ticket_id: string
          total: number | null
        }
        Insert: {
          description?: string | null
          id?: string
          part_number?: string | null
          price_each?: number | null
          qty?: number
          sort_order?: number
          ticket_id: string
          total?: number | null
        }
        Update: {
          description?: string | null
          id?: string
          part_number?: string | null
          price_each?: number | null
          qty?: number
          sort_order?: number
          ticket_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_materials_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_number_sequences: {
        Row: {
          company_id: string
          next_value: number
          year: number
        }
        Insert: {
          company_id: string
          next_value?: number
          year: number
        }
        Update: {
          company_id?: string
          next_value?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_number_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_photos: {
        Row: {
          caption: string | null
          file_url: string
          id: string
          thumbnail_url: string | null
          ticket_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          file_url: string
          id?: string
          thumbnail_url?: string | null
          ticket_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          file_url?: string
          id?: string
          thumbnail_url?: string | null
          ticket_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_photos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_signatures: {
        Row: {
          id: string
          image_url: string
          kind: Database["public"]["Enums"]["signature_kind"]
          signed_at: string
          signer_name: string | null
          ticket_id: string
        }
        Insert: {
          id?: string
          image_url: string
          kind: Database["public"]["Enums"]["signature_kind"]
          signed_at?: string
          signer_name?: string | null
          ticket_id: string
        }
        Update: {
          id?: string
          image_url?: string
          kind?: Database["public"]["Enums"]["signature_kind"]
          signed_at?: string
          signer_name?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_signatures_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_vehicles: {
        Row: {
          id: string
          mileage_end: number | null
          mileage_start: number | null
          rate: number | null
          sort_order: number
          ticket_id: string
          total: number | null
          total_miles: number | null
          vehicle_id: string | null
          vehicle_label: string | null
        }
        Insert: {
          id?: string
          mileage_end?: number | null
          mileage_start?: number | null
          rate?: number | null
          sort_order?: number
          ticket_id: string
          total?: number | null
          total_miles?: number | null
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Update: {
          id?: string
          mileage_end?: number | null
          mileage_start?: number | null
          rate?: number | null
          sort_order?: number
          ticket_id?: string
          total?: number | null
          total_miles?: number | null
          vehicle_id?: string | null
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_vehicles_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          customer_id: string
          equipment_enabled: boolean
          finalized_at: string | null
          finalized_by: string | null
          grand_total: number
          has_post_finalize_changes: boolean
          id: string
          job_location: string | null
          job_number: string | null
          job_problem: string | null
          requestor: string
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          ticket_type: string | null
          updated_at: string
          work_date: string
          work_description: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          customer_id: string
          equipment_enabled?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          grand_total?: number
          has_post_finalize_changes?: boolean
          id?: string
          job_location?: string | null
          job_number?: string | null
          job_problem?: string | null
          requestor?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          ticket_type?: string | null
          updated_at?: string
          work_date?: string
          work_description?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          equipment_enabled?: boolean
          finalized_at?: string | null
          finalized_by?: string | null
          grand_total?: number
          has_post_finalize_changes?: boolean
          id?: string
          job_location?: string | null
          job_number?: string | null
          job_problem?: string | null
          requestor?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: string
          ticket_type?: string | null
          updated_at?: string
          work_date?: string
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          assigned_user_id: string | null
          color: string | null
          company_id: string
          created_at: string
          current_mileage: number | null
          date_acquired: string | null
          default_mileage_rate: number
          description: string | null
          id: string
          is_lease: boolean
          label: string
          lease_end_date: string | null
          license_plate: string | null
          make: string | null
          model: string | null
          truck_number: string | null
          year: number | null
        }
        Insert: {
          active?: boolean
          assigned_user_id?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          current_mileage?: number | null
          date_acquired?: string | null
          default_mileage_rate?: number
          description?: string | null
          id?: string
          is_lease?: boolean
          label: string
          lease_end_date?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          truck_number?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean
          assigned_user_id?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          current_mileage?: number | null
          date_acquired?: string | null
          default_mileage_rate?: number
          description?: string | null
          id?: string
          is_lease?: boolean
          label?: string
          lease_end_date?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          truck_number?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_company_id: { Args: never; Returns: string }
      auth_profile: {
        Args: never
        Returns: {
          active: boolean
          classification_id: string | null
          company_id: string
          created_at: string
          default_vehicle_id: string | null
          email: string
          first_name: string
          id: string
          is_readonly_admin: boolean
          last_name: string
          notification_on_return: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_ticket_safe: { Args: { p_ticket_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_writable_admin: { Args: never; Returns: boolean }
      next_ticket_number: { Args: { p_company_id: string }; Returns: string }
      recompute_ticket_grand_total: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
    }
    Enums: {
      audit_action:
        | "created"
        | "edited"
        | "submitted"
        | "return_requested"
        | "returned"
        | "edited_by_admin"
        | "finalized"
        | "unfinalized"
        | "exported"
      export_format: "pdf" | "xlsx"
      signature_kind: "customer" | "supervisor"
      ticket_status: "draft" | "submitted" | "returned" | "finalized"
      user_role: "user" | "admin"
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
      audit_action: [
        "created",
        "edited",
        "submitted",
        "return_requested",
        "returned",
        "edited_by_admin",
        "finalized",
        "unfinalized",
        "exported",
      ],
      export_format: ["pdf", "xlsx"],
      signature_kind: ["customer", "supervisor"],
      ticket_status: ["draft", "submitted", "returned", "finalized"],
      user_role: ["user", "admin"],
    },
  },
} as const
