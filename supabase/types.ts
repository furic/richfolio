
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "invites": {
                  Row: {
                    "accepted_at": string | null,"email": string,"invited_at": string,"invited_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"email": string,"invited_at"?: string,"invited_by"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"email"?: string,"invited_at"?: string,"invited_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"default_currency": string,"display_name": string | null,"id": string,"is_admin": boolean,"planned_portfolio_value": number,"settings": NonNullable<Json>,"time_zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_currency"?: string,"display_name"?: string | null,"id": string,"is_admin"?: boolean,"planned_portfolio_value"?: number,"settings"?: NonNullable<Json>,"time_zone"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_currency"?: string,"display_name"?: string | null,"id"?: string,"is_admin"?: boolean,"planned_portfolio_value"?: number,"settings"?: NonNullable<Json>,"time_zone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"targets": {
                  Row: {
                    "target_pct": number,"ticker": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "target_pct": number,"ticker": string,"user_id": string
                  }
                  Update: {
                    "target_pct"?: number,"ticker"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "targets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ticker_status": {
                  Row: {
                    "checked_at": string,"exchange": string | null,"kind": string,"last_fetch_failed_at": string | null,"name": string | null,"quote_currency": string | null,"symbol": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"exchange"?: string | null,"kind": string,"last_fetch_failed_at"?: string | null,"name"?: string | null,"quote_currency"?: string | null,"symbol": string,"verified": boolean
                  }
                  Update: {
                    "checked_at"?: string,"exchange"?: string | null,"kind"?: string,"last_fetch_failed_at"?: string | null,"name"?: string | null,"quote_currency"?: string | null,"symbol"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "created_at": string,"currency": string | null,"fees": number,"id": string,"note": string | null,"price": number | null,"shares": number,"ticker": string,"traded_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string | null,"fees"?: number,"id"?: string,"note"?: string | null,"price"?: number | null,"shares": number,"ticker": string,"traded_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string | null,"fees"?: number,"id"?: string,"note"?: string | null,"price"?: number | null,"shares"?: number,"ticker"?: string,"traded_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"watchlist": {
                  Row: {
                    "kind": string,"symbol": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "kind": string,"symbol": string,"user_id": string
                  }
                  Update: {
                    "kind"?: string,"symbol"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watchlist_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "holdings": {
                  Row: {
                    "shares": number | null,"ticker": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "transactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "assert_position_non_negative":
{ Args: { "p_ticker": string,"p_user": string }; Returns: undefined
                           },
"hook_require_invite":
{ Args: { "event": Json }; Returns: Json
                           },
"import_portfolio":
{ Args: { "payload": Json }; Returns: undefined
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"ping":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"save_portfolio_row":
{ Args: { "p_avg_price": number,"p_currency": string,"p_shares": number,"p_target_pct": number,"p_ticker": string }; Returns: undefined
                           },
"settings_schema":
{ Args: Record<PropertyKey, never>; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
