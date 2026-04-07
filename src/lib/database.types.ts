export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'tech' | 'admin'
export type TicketStatus = 'draft' | 'submitted' | 'returned' | 'finalized'
export type ExportFormat = 'pdf' | 'xlsx'
export type SignatureKind = 'customer' | 'supervisor'
export type AuditAction =
  | 'created'
  | 'edited'
  | 'submitted'
  | 'return_requested'
  | 'returned'
  | 'edited_by_admin'
  | 'finalized'
  | 'unfinalized'
  | 'exported'

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          company_id: string
          email: string
          first_name: string
          last_name: string
          role: UserRole
          is_readonly_admin: boolean
          classification_id: string | null
          default_vehicle_id: string | null
          notification_on_return: boolean
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      classifications: {
        Row: {
          id: string
          company_id: string
          name: string
          default_reg_rate: number
          default_ot_rate: number
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['classifications']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['classifications']['Insert']>
      }
      vehicles: {
        Row: {
          id: string
          company_id: string
          label: string
          description: string | null
          default_mileage_rate: number
          assigned_user_id: string | null
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['vehicles']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['vehicles']['Insert']>
      }
      customers: {
        Row: {
          id: string
          company_id: string
          name: string
          address: string | null
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      customer_contacts: {
        Row: {
          id: string
          customer_id: string
          name: string
          phone: string | null
          email: string | null
          title: string | null
          is_primary: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customer_contacts']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['customer_contacts']['Insert']>
      }
      tickets: {
        Row: {
          id: string
          company_id: string
          ticket_number: string
          customer_id: string
          requestor: string
          job_number: string | null
          job_location: string | null
          job_problem: string | null
          ticket_type: string | null
          work_date: string
          work_description: string | null
          equipment_enabled: boolean
          status: TicketStatus
          created_by: string
          grand_total: number
          finalized_at: string | null
          finalized_by: string | null
          has_post_finalize_changes: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'ticket_number' | 'grand_total' | 'has_post_finalize_changes' | 'created_at' | 'updated_at'> & {
          id?: string
          ticket_number?: string
          grand_total?: number
          has_post_finalize_changes?: boolean
        }
        Update: Partial<Database['public']['Tables']['tickets']['Insert']>
      }
      ticket_materials: {
        Row: {
          id: string
          ticket_id: string
          sort_order: number
          qty: number
          part_number: string | null
          description: string | null
          price_each: number | null
          total: number | null
        }
        Insert: Omit<Database['public']['Tables']['ticket_materials']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_materials']['Insert']>
      }
      ticket_labor: {
        Row: {
          id: string
          ticket_id: string
          sort_order: number
          user_id: string | null
          first_name: string
          last_name: string
          classification_snapshot: string | null
          start_time: string | null
          end_time: string | null
          hours: number | null
          reg_hours: number | null
          ot_hours: number | null
          reg_rate: number | null
          ot_rate: number | null
          reg_total: number | null
          ot_total: number | null
          row_total: number | null
        }
        Insert: Omit<Database['public']['Tables']['ticket_labor']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_labor']['Insert']>
      }
      ticket_equipment: {
        Row: {
          id: string
          ticket_id: string
          sort_order: number
          equip_number: string | null
          hours: number | null
          rate: number | null
          total: number | null
        }
        Insert: Omit<Database['public']['Tables']['ticket_equipment']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_equipment']['Insert']>
      }
      ticket_vehicles: {
        Row: {
          id: string
          ticket_id: string
          sort_order: number
          vehicle_id: string | null
          vehicle_label: string | null
          mileage_start: number | null
          mileage_end: number | null
          total_miles: number | null
          rate: number | null
          total: number | null
        }
        Insert: Omit<Database['public']['Tables']['ticket_vehicles']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_vehicles']['Insert']>
      }
      ticket_photos: {
        Row: {
          id: string
          ticket_id: string
          file_url: string
          thumbnail_url: string | null
          caption: string | null
          uploaded_by: string
          uploaded_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_photos']['Row'], 'id' | 'uploaded_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_photos']['Insert']>
      }
      ticket_signatures: {
        Row: {
          id: string
          ticket_id: string
          kind: SignatureKind
          signer_name: string | null
          signed_at: string
          image_url: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_signatures']['Row'], 'id'> & { id?: string }
        Update: Partial<Database['public']['Tables']['ticket_signatures']['Insert']>
      }
      ticket_audit_log: {
        Row: {
          id: string
          ticket_id: string
          actor_id: string | null
          actor_name: string | null
          action: AuditAction
          diff: Json | null
          note: string | null
          occurred_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_audit_log']['Row'], 'id' | 'occurred_at'> & { id?: string }
        Update: never
      }
      ticket_exports: {
        Row: {
          id: string
          ticket_id: string
          format: ExportFormat
          file_url: string
          is_stale: boolean
          generated_at: string
          generated_by: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_exports']['Row'], 'id' | 'generated_at' | 'is_stale'> & { id?: string }
        Update: Partial<Pick<Database['public']['Tables']['ticket_exports']['Row'], 'is_stale'>>
      }
      ticket_number_sequences: {
        Row: {
          company_id: string
          year: number
          next_value: number
        }
        Insert: Database['public']['Tables']['ticket_number_sequences']['Row']
        Update: Partial<Database['public']['Tables']['ticket_number_sequences']['Row']>
      }
      notification_prefs: {
        Row: {
          user_id: string
          key: string
          email_enabled: boolean
          in_app_enabled: boolean
        }
        Insert: Database['public']['Tables']['notification_prefs']['Row']
        Update: Partial<Database['public']['Tables']['notification_prefs']['Row']>
      }
    }
  }
}
