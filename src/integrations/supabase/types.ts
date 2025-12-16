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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bom_suggestions: {
        Row: {
          confidence: number | null
          created_at: string
          historical_frequency: number | null
          id: string
          product_code: string | null
          project_intelligence_id: string | null
          reasoning: string | null
          suggested_quantity: number | null
          unit_price: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          historical_frequency?: number | null
          id?: string
          product_code?: string | null
          project_intelligence_id?: string | null
          reasoning?: string | null
          suggested_quantity?: number | null
          unit_price?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          historical_frequency?: number | null
          id?: string
          product_code?: string | null
          project_intelligence_id?: string | null
          reasoning?: string | null
          suggested_quantity?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_suggestions_project_intelligence_id_fkey"
            columns: ["project_intelligence_id"]
            isOneToOne: false
            referencedRelation: "project_intelligence"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          email_content: string | null
          email_message_id: string | null
          extracted_data: Json | null
          id: string
          postal_code: string | null
          processing_status: Json | null
          status: string | null
          subject: string | null
          task_type: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          email_content?: string | null
          email_message_id?: string | null
          extracted_data?: Json | null
          id?: string
          postal_code?: string | null
          processing_status?: Json | null
          status?: string | null
          subject?: string | null
          task_type?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          email_content?: string | null
          email_message_id?: string | null
          extracted_data?: Json | null
          id?: string
          postal_code?: string | null
          processing_status?: Json | null
          status?: string | null
          subject?: string | null
          task_type?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          category: string | null
          created_at: string | null
          critical: boolean | null
          id: string
          key: string
          net_price: number
          notes: string | null
          supplier_sku: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          critical?: boolean | null
          id?: string
          key: string
          net_price?: number
          notes?: string | null
          supplier_sku?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          critical?: boolean | null
          id?: string
          key?: string
          net_price?: number
          notes?: string | null
          supplier_sku?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      correction_rules: {
        Row: {
          ai_summary: string | null
          complexity: string | null
          confidence: number | null
          corrected_value: Json | null
          correction_type: string
          correction_value: Json
          created_at: string
          id: string
          is_active: boolean | null
          keywords: string[] | null
          original_value: Json | null
          project_type: string | null
          scope: string | null
          size_max: number | null
          size_min: number | null
          source_case_id: string | null
          source_quote_id: string | null
          success_rate: number | null
          times_applied: number | null
          updated_at: string
          user_reasoning: string | null
        }
        Insert: {
          ai_summary?: string | null
          complexity?: string | null
          confidence?: number | null
          corrected_value?: Json | null
          correction_type: string
          correction_value: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          original_value?: Json | null
          project_type?: string | null
          scope?: string | null
          size_max?: number | null
          size_min?: number | null
          source_case_id?: string | null
          source_quote_id?: string | null
          success_rate?: number | null
          times_applied?: number | null
          updated_at?: string
          user_reasoning?: string | null
        }
        Update: {
          ai_summary?: string | null
          complexity?: string | null
          confidence?: number | null
          corrected_value?: Json | null
          correction_type?: string
          correction_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          original_value?: Json | null
          project_type?: string | null
          scope?: string | null
          size_max?: number | null
          size_min?: number | null
          source_case_id?: string | null
          source_quote_id?: string | null
          success_rate?: number | null
          times_applied?: number | null
          updated_at?: string
          user_reasoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_rules_source_case_id_fkey"
            columns: ["source_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_rules_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          postal_code: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      data_import_runs: {
        Row: {
          error_message: string | null
          file_checksum: string
          file_type: string
          id: string
          imported_at: string | null
          rows_imported: number | null
          status: string | null
        }
        Insert: {
          error_message?: string | null
          file_checksum: string
          file_type: string
          id?: string
          imported_at?: string | null
          rows_imported?: number | null
          status?: string | null
        }
        Update: {
          error_message?: string | null
          file_checksum?: string
          file_type?: string
          id?: string
          imported_at?: string | null
          rows_imported?: number | null
          status?: string | null
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          created_at: string | null
          description: string | null
          discount_group: string
          discount_percentage: number
          id: string
          product_code_prefix: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_group: string
          discount_percentage: number
          id?: string
          product_code_prefix?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_group?: string
          discount_percentage?: number
          id?: string
          product_code_prefix?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      enhanced_supplier_prices: {
        Row: {
          category: string | null
          created_at: string
          ean_id: string | null
          gross_price: number | null
          id: string
          image_url: string | null
          is_on_stock: boolean | null
          leadtime: number | null
          link: string | null
          long_description: string | null
          net_price: number | null
          normalized_text: string | null
          ordering_factor_1: number | null
          ordering_factor_2: number | null
          ordering_unit_1: string | null
          ordering_unit_2: string | null
          price_quantity: number | null
          price_unit: string | null
          search_vector: unknown
          short_description: string | null
          supplier_item_id: string | null
          unit_price_norm: number | null
          vvs_number: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          ean_id?: string | null
          gross_price?: number | null
          id?: string
          image_url?: string | null
          is_on_stock?: boolean | null
          leadtime?: number | null
          link?: string | null
          long_description?: string | null
          net_price?: number | null
          normalized_text?: string | null
          ordering_factor_1?: number | null
          ordering_factor_2?: number | null
          ordering_unit_1?: string | null
          ordering_unit_2?: string | null
          price_quantity?: number | null
          price_unit?: string | null
          search_vector?: unknown
          short_description?: string | null
          supplier_item_id?: string | null
          unit_price_norm?: number | null
          vvs_number?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          ean_id?: string | null
          gross_price?: number | null
          id?: string
          image_url?: string | null
          is_on_stock?: boolean | null
          leadtime?: number | null
          link?: string | null
          long_description?: string | null
          net_price?: number | null
          normalized_text?: string | null
          ordering_factor_1?: number | null
          ordering_factor_2?: number | null
          ordering_unit_1?: string | null
          ordering_unit_2?: string | null
          price_quantity?: number | null
          price_unit?: string | null
          search_vector?: unknown
          short_description?: string | null
          supplier_item_id?: string | null
          unit_price_norm?: number | null
          vvs_number?: string | null
        }
        Relationships: []
      }
      gmail_sync_state: {
        Row: {
          id: string
          last_history_id: string | null
          last_sync_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_history_id?: string | null
          last_sync_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_history_id?: string | null
          last_sync_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      historical_material_lines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          line_total: number | null
          normalized_description: string | null
          product_code: string | null
          project_id: string | null
          quantity: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number | null
          normalized_description?: string | null
          product_code?: string | null
          project_id?: string | null
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number | null
          normalized_description?: string | null
          product_code?: string | null
          project_id?: string | null
          quantity?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_material_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "historical_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_projects: {
        Row: {
          complexity_signals: Json | null
          created_at: string
          customer_ref: string | null
          date_source: string | null
          id: string
          line_date_assumed: string | null
          project_description: string | null
          project_type: string
          report_from: string | null
          report_to: string | null
          total_hours: number | null
          total_materials_cost: number | null
          total_project_cost: number | null
        }
        Insert: {
          complexity_signals?: Json | null
          created_at?: string
          customer_ref?: string | null
          date_source?: string | null
          id?: string
          line_date_assumed?: string | null
          project_description?: string | null
          project_type: string
          report_from?: string | null
          report_to?: string | null
          total_hours?: number | null
          total_materials_cost?: number | null
          total_project_cost?: number | null
        }
        Update: {
          complexity_signals?: Json | null
          created_at?: string
          customer_ref?: string | null
          date_source?: string | null
          id?: string
          line_date_assumed?: string | null
          project_description?: string | null
          project_type?: string
          report_from?: string | null
          report_to?: string | null
          total_hours?: number | null
          total_materials_cost?: number | null
          total_project_cost?: number | null
        }
        Relationships: []
      }
      material_floors: {
        Row: {
          base_floor: number
          id: string
          per_unit_floor: number
          project_type: string
          updated_at: string
        }
        Insert: {
          base_floor?: number
          id?: string
          per_unit_floor?: number
          project_type: string
          updated_at?: string
        }
        Update: {
          base_floor?: number
          id?: string
          per_unit_floor?: number
          project_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_matches: {
        Row: {
          component_key: string
          confidence: number | null
          created_at: string | null
          id: string
          matched_product_code: string | null
          matched_vvs_number: string | null
          project_type: string | null
          search_query: string | null
        }
        Insert: {
          component_key: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          matched_product_code?: string | null
          matched_vvs_number?: string | null
          project_type?: string | null
          search_query?: string | null
        }
        Update: {
          component_key?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          matched_product_code?: string | null
          matched_vvs_number?: string | null
          project_type?: string | null
          search_query?: string | null
        }
        Relationships: []
      }
      material_search_cache: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          materials: Json
          project_type: string | null
          search_query: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          materials: Json
          project_type?: string | null
          search_query: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          materials?: Json
          project_type?: string | null
          search_query?: string
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          city: string | null
          created_at: string
          effective_from: string
          hourly_rate: number
          hourly_rate_labor: number | null
          hourly_rate_vehicle: number | null
          id: string
          material_markup: number
          minimum_project: number
          postal_code: string | null
          service_vehicle_rate: number
          timesats_mode: string
          updated_at: string
          vat_rate: number
          version: number
        }
        Insert: {
          city?: string | null
          created_at?: string
          effective_from?: string
          hourly_rate?: number
          hourly_rate_labor?: number | null
          hourly_rate_vehicle?: number | null
          id?: string
          material_markup?: number
          minimum_project?: number
          postal_code?: string | null
          service_vehicle_rate?: number
          timesats_mode?: string
          updated_at?: string
          vat_rate?: number
          version?: number
        }
        Update: {
          city?: string | null
          created_at?: string
          effective_from?: string
          hourly_rate?: number
          hourly_rate_labor?: number | null
          hourly_rate_vehicle?: number | null
          id?: string
          material_markup?: number
          minimum_project?: number
          postal_code?: string | null
          service_vehicle_rate?: number
          timesats_mode?: string
          updated_at?: string
          vat_rate?: number
          version?: number
        }
        Relationships: []
      }
      pricing_profiles: {
        Row: {
          apply_minimum_project: boolean
          average_size: number
          base_hours: number
          beta_default: number
          created_at: string
          id: string
          material_cost_per_unit: number | null
          max_hours: number
          min_hours: number
          min_labor_hours: number
          project_type: string
          unit: string
          updated_at: string
        }
        Insert: {
          apply_minimum_project?: boolean
          average_size: number
          base_hours: number
          beta_default?: number
          created_at?: string
          id?: string
          material_cost_per_unit?: number | null
          max_hours: number
          min_hours: number
          min_labor_hours: number
          project_type: string
          unit: string
          updated_at?: string
        }
        Update: {
          apply_minimum_project?: boolean
          average_size?: number
          base_hours?: number
          beta_default?: number
          created_at?: string
          id?: string
          material_cost_per_unit?: number | null
          max_hours?: number
          min_hours?: number
          min_labor_hours?: number
          project_type?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_intelligence: {
        Row: {
          bom_suggestions: Json | null
          case_id: string | null
          complexity_score: number | null
          confidence_score: number | null
          created_at: string
          estimated_hours: number | null
          explanations: Json | null
          id: string
          intent: string | null
          risk_hours: number | null
          signals: Json | null
        }
        Insert: {
          bom_suggestions?: Json | null
          case_id?: string | null
          complexity_score?: number | null
          confidence_score?: number | null
          created_at?: string
          estimated_hours?: number | null
          explanations?: Json | null
          id?: string
          intent?: string | null
          risk_hours?: number | null
          signals?: Json | null
        }
        Update: {
          bom_suggestions?: Json | null
          case_id?: string | null
          complexity_score?: number | null
          confidence_score?: number | null
          created_at?: string
          estimated_hours?: number | null
          explanations?: Json | null
          id?: string
          intent?: string | null
          risk_hours?: number | null
          signals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_intelligence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_feedback: {
        Row: {
          accuracy_score: number | null
          actual_cost: number | null
          actual_hours_spent: number | null
          actual_materials_used: Json | null
          ai_confidence: number | null
          ai_suggested_hours: number | null
          ai_suggested_materials: Json | null
          case_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          quote_id: string | null
          user_final_hours: number | null
          user_final_materials: Json | null
          user_modifications: Json | null
          user_satisfaction: number | null
        }
        Insert: {
          accuracy_score?: number | null
          actual_cost?: number | null
          actual_hours_spent?: number | null
          actual_materials_used?: Json | null
          ai_confidence?: number | null
          ai_suggested_hours?: number | null
          ai_suggested_materials?: Json | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_id?: string | null
          user_final_hours?: number | null
          user_final_materials?: Json | null
          user_modifications?: Json | null
          user_satisfaction?: number | null
        }
        Update: {
          accuracy_score?: number | null
          actual_cost?: number | null
          actual_hours_spent?: number | null
          actual_materials_used?: Json | null
          ai_confidence?: number | null
          ai_suggested_hours?: number | null
          ai_suggested_materials?: Json | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quote_id?: string | null
          user_final_hours?: number | null
          user_final_materials?: Json | null
          user_modifications?: Json | null
          user_satisfaction?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_feedback_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          component_key: string | null
          customer_supplied: boolean | null
          description: string
          id: string
          labor_hours: number | null
          line_type: string | null
          material_code: string | null
          quantity: number | null
          quote_id: string | null
          sort_order: number | null
          source: string | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
          validated: boolean | null
        }
        Insert: {
          component_key?: string | null
          customer_supplied?: boolean | null
          description: string
          id?: string
          labor_hours?: number | null
          line_type?: string | null
          material_code?: string | null
          quantity?: number | null
          quote_id?: string | null
          sort_order?: number | null
          source?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          validated?: boolean | null
        }
        Update: {
          component_key?: string | null
          customer_supplied?: boolean | null
          description?: string
          id?: string
          labor_hours?: number | null
          line_type?: string | null
          material_code?: string | null
          quantity?: number | null
          quote_id?: string | null
          sort_order?: number | null
          source?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          validated?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          applied_corrections: Json | null
          case_id: string | null
          created_at: string | null
          id: string
          labor_hours: number | null
          metadata: Json | null
          pricing_snapshot: Json | null
          pricing_trace: Json | null
          quote_number: string | null
          service_vehicle_cost: number | null
          status: string | null
          subtotal: number | null
          total_amount: number | null
          travel_cost: number | null
          travel_time: number | null
          updated_at: string | null
          valid_until: string | null
          vat_amount: number | null
        }
        Insert: {
          applied_corrections?: Json | null
          case_id?: string | null
          created_at?: string | null
          id?: string
          labor_hours?: number | null
          metadata?: Json | null
          pricing_snapshot?: Json | null
          pricing_trace?: Json | null
          quote_number?: string | null
          service_vehicle_cost?: number | null
          status?: string | null
          subtotal?: number | null
          total_amount?: number | null
          travel_cost?: number | null
          travel_time?: number | null
          updated_at?: string | null
          valid_until?: string | null
          vat_amount?: number | null
        }
        Update: {
          applied_corrections?: Json | null
          case_id?: string | null
          created_at?: string | null
          id?: string
          labor_hours?: number | null
          metadata?: Json | null
          pricing_snapshot?: Json | null
          pricing_trace?: Json | null
          quote_number?: string | null
          service_vehicle_cost?: number | null
          status?: string | null
          subtotal?: number | null
          total_amount?: number | null
          travel_cost?: number | null
          travel_time?: number | null
          updated_at?: string | null
          valid_until?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_prices: {
        Row: {
          base_price: number | null
          description: string | null
          final_price: number | null
          id: string
          last_updated: string | null
          product_code: string | null
          supplier_id: string | null
          valentin_mapping: string | null
        }
        Insert: {
          base_price?: number | null
          description?: string | null
          final_price?: number | null
          id?: string
          last_updated?: string | null
          product_code?: string | null
          supplier_id?: string | null
          valentin_mapping?: string | null
        }
        Update: {
          base_price?: number | null
          description?: string | null
          final_price?: number | null
          id?: string
          last_updated?: string | null
          product_code?: string | null
          supplier_id?: string | null
          valentin_mapping?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      import_enhanced_supplier_data: { Args: never; Returns: undefined }
      median_unit_price_by_category: {
        Args: { in_category: string }
        Returns: {
          median: number
        }[]
      }
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
