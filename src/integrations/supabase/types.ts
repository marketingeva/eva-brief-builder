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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ad_launches: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          client_id: string
          creative_filename: string | null
          creative_id: string | null
          error: string | null
          id: string
          launched_at: string
          launched_by: string | null
          lead_form_id: string | null
          status: string
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          client_id: string
          creative_filename?: string | null
          creative_id?: string | null
          error?: string | null
          id?: string
          launched_at?: string
          launched_by?: string | null
          lead_form_id?: string | null
          status?: string
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          client_id?: string
          creative_filename?: string | null
          creative_id?: string | null
          error?: string | null
          id?: string
          launched_at?: string
          launched_by?: string | null
          lead_form_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_launches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          agent_type: string
          client_id: string
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_type: string
          client_id: string
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_type?: string
          client_id?: string
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_reports: {
        Row: {
          agent_type: string
          client_id: string
          content: Json
          created_at: string
          id: string
          pdf_path: string | null
          report_source: string
          report_type: string | null
          title: string | null
        }
        Insert: {
          agent_type: string
          client_id: string
          content?: Json
          created_at?: string
          id?: string
          pdf_path?: string | null
          report_source?: string
          report_type?: string | null
          title?: string | null
        }
        Update: {
          agent_type?: string
          client_id?: string
          content?: Json
          created_at?: string
          id?: string
          pdf_path?: string | null
          report_source?: string
          report_type?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_requests: {
        Row: {
          care_type: string | null
          client_id: string
          created_at: string
          created_by: string
          creative_type: string | null
          cta: string | null
          employment_type: string | null
          extra_notes: string | null
          functions: string[] | null
          hard_requirements: string | null
          hours_type: string | null
          id: string
          is_new_concept: boolean | null
          location: string | null
          num_variations: number | null
          priority: string | null
          reference_file_path: string | null
          request_type: string | null
          status: string | null
          style: string | null
          target_audience: string | null
          usps: string | null
          week_number: number | null
          words_to_avoid: string | null
        }
        Insert: {
          care_type?: string | null
          client_id: string
          created_at?: string
          created_by: string
          creative_type?: string | null
          cta?: string | null
          employment_type?: string | null
          extra_notes?: string | null
          functions?: string[] | null
          hard_requirements?: string | null
          hours_type?: string | null
          id?: string
          is_new_concept?: boolean | null
          location?: string | null
          num_variations?: number | null
          priority?: string | null
          reference_file_path?: string | null
          request_type?: string | null
          status?: string | null
          style?: string | null
          target_audience?: string | null
          usps?: string | null
          week_number?: number | null
          words_to_avoid?: string | null
        }
        Update: {
          care_type?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          creative_type?: string | null
          cta?: string | null
          employment_type?: string | null
          extra_notes?: string | null
          functions?: string[] | null
          hard_requirements?: string | null
          hours_type?: string | null
          id?: string
          is_new_concept?: boolean | null
          location?: string | null
          num_variations?: number | null
          priority?: string | null
          reference_file_path?: string | null
          request_type?: string | null
          status?: string | null
          style?: string | null
          target_audience?: string | null
          usps?: string | null
          week_number?: number | null
          words_to_avoid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefing_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_rows: {
        Row: {
          briefing_id: string | null
          client_id: string
          created_at: string
          creative_image_path: string | null
          creative_image_paths: string[] | null
          creative_inspiratie: string | null
          functie: string | null
          functies: string[] | null
          hook: string | null
          id: string
          is_new: boolean | null
          locatie: string | null
          locaties: string[] | null
          meta_briefing_id: string | null
          omschrijving: string | null
          sort_order: number | null
          status: string | null
          usps: string | null
          vacature_url: string | null
        }
        Insert: {
          briefing_id?: string | null
          client_id: string
          created_at?: string
          creative_image_path?: string | null
          creative_image_paths?: string[] | null
          creative_inspiratie?: string | null
          functie?: string | null
          functies?: string[] | null
          hook?: string | null
          id?: string
          is_new?: boolean | null
          locatie?: string | null
          locaties?: string[] | null
          meta_briefing_id?: string | null
          omschrijving?: string | null
          sort_order?: number | null
          status?: string | null
          usps?: string | null
          vacature_url?: string | null
        }
        Update: {
          briefing_id?: string | null
          client_id?: string
          created_at?: string
          creative_image_path?: string | null
          creative_image_paths?: string[] | null
          creative_inspiratie?: string | null
          functie?: string | null
          functies?: string[] | null
          hook?: string | null
          id?: string
          is_new?: boolean | null
          locatie?: string | null
          locaties?: string[] | null
          meta_briefing_id?: string | null
          omschrijving?: string | null
          sort_order?: number | null
          status?: string | null
          usps?: string | null
          vacature_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefing_rows_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "generated_briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefing_rows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefing_rows_meta_briefing_id_fkey"
            columns: ["meta_briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      briefings_meta: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string
          id: string
          status: string
          updated_at: string
          week_number: number
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          status?: string
          updated_at?: string
          week_number: number
          year?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          updated_at?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "briefings_meta_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_requests: {
        Row: {
          angle_preference: string | null
          campaign_focus: string | null
          channel: string | null
          client_id: string
          created_at: string
          created_by: string
          creative_type: string | null
          id: string
          internal_notes: string | null
          objective: string | null
          priority_audience: string | null
          region: string | null
          role_title: string | null
          status: string | null
          urgency: string | null
        }
        Insert: {
          angle_preference?: string | null
          campaign_focus?: string | null
          channel?: string | null
          client_id: string
          created_at?: string
          created_by: string
          creative_type?: string | null
          id?: string
          internal_notes?: string | null
          objective?: string | null
          priority_audience?: string | null
          region?: string | null
          role_title?: string | null
          status?: string | null
          urgency?: string | null
        }
        Update: {
          angle_preference?: string | null
          campaign_focus?: string | null
          channel?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          creative_type?: string | null
          id?: string
          internal_notes?: string | null
          objective?: string | null
          priority_audience?: string | null
          region?: string | null
          role_title?: string | null
          status?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_audience_insights: {
        Row: {
          client_id: string
          description: string | null
          id: string
          objections: string[] | null
          platform_notes: string | null
          segment_name: string
          triggers: string[] | null
        }
        Insert: {
          client_id: string
          description?: string | null
          id?: string
          objections?: string[] | null
          platform_notes?: string | null
          segment_name: string
          triggers?: string[] | null
        }
        Update: {
          client_id?: string
          description?: string | null
          id?: string
          objections?: string[] | null
          platform_notes?: string | null
          segment_name?: string
          triggers?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_audience_insights_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_brand_profiles: {
        Row: {
          client_id: string
          employer_branding: string | null
          id: string
          tone_of_voice: string | null
          updated_at: string
          visual_style_notes: string | null
          why_work_here: string | null
          words_to_avoid: string[] | null
          words_to_use: string[] | null
        }
        Insert: {
          client_id: string
          employer_branding?: string | null
          id?: string
          tone_of_voice?: string | null
          updated_at?: string
          visual_style_notes?: string | null
          why_work_here?: string | null
          words_to_avoid?: string[] | null
          words_to_use?: string[] | null
        }
        Update: {
          client_id?: string
          employer_branding?: string | null
          id?: string
          tone_of_voice?: string | null
          updated_at?: string
          visual_style_notes?: string | null
          why_work_here?: string | null
          words_to_avoid?: string[] | null
          words_to_use?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_brand_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_learning_assets: {
        Row: {
          asset_category: string
          client_id: string
          created_at: string
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          asset_category?: string
          client_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          asset_category?: string
          client_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_learning_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_learning_profiles: {
        Row: {
          care_types: string[] | null
          client_id: string
          communication_guidelines: string | null
          creative_donts: string[] | null
          creative_dos: string[] | null
          employer_branding: string | null
          field_statuses: Json | null
          id: string
          internal_notes: string | null
          strategic_recruitment_goals: string | null
          tone_of_voice: string | null
          updated_at: string
          visual_style_notes: string | null
          website_analysis_data: Json | null
          website_analyzed_at: string | null
          why_work_here: string | null
          words_to_avoid: string[] | null
          words_to_use: string[] | null
        }
        Insert: {
          care_types?: string[] | null
          client_id: string
          communication_guidelines?: string | null
          creative_donts?: string[] | null
          creative_dos?: string[] | null
          employer_branding?: string | null
          field_statuses?: Json | null
          id?: string
          internal_notes?: string | null
          strategic_recruitment_goals?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          visual_style_notes?: string | null
          website_analysis_data?: Json | null
          website_analyzed_at?: string | null
          why_work_here?: string | null
          words_to_avoid?: string[] | null
          words_to_use?: string[] | null
        }
        Update: {
          care_types?: string[] | null
          client_id?: string
          communication_guidelines?: string | null
          creative_donts?: string[] | null
          creative_dos?: string[] | null
          employer_branding?: string | null
          field_statuses?: Json | null
          id?: string
          internal_notes?: string | null
          strategic_recruitment_goals?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          visual_style_notes?: string | null
          website_analysis_data?: Json | null
          website_analyzed_at?: string | null
          why_work_here?: string | null
          words_to_avoid?: string[] | null
          words_to_use?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_learning_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_learnings: {
        Row: {
          audience_resonance: string | null
          campaign_date: string | null
          client_feedback: string | null
          client_id: string
          concept: string | null
          created_at: string
          created_by: string | null
          hook_used: string | null
          id: string
          recruiter_feedback: string | null
          result: string | null
          tags: string[] | null
          visual_notes: string | null
          what_failed: string | null
          what_worked: string | null
        }
        Insert: {
          audience_resonance?: string | null
          campaign_date?: string | null
          client_feedback?: string | null
          client_id: string
          concept?: string | null
          created_at?: string
          created_by?: string | null
          hook_used?: string | null
          id?: string
          recruiter_feedback?: string | null
          result?: string | null
          tags?: string[] | null
          visual_notes?: string | null
          what_failed?: string | null
          what_worked?: string | null
        }
        Update: {
          audience_resonance?: string | null
          campaign_date?: string | null
          client_feedback?: string | null
          client_id?: string
          concept?: string | null
          created_at?: string
          created_by?: string | null
          hook_used?: string | null
          id?: string
          recruiter_feedback?: string | null
          result?: string | null
          tags?: string[] | null
          visual_notes?: string | null
          what_failed?: string | null
          what_worked?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_learnings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_locations: {
        Row: {
          city: string | null
          client_id: string
          id: string
          is_commute_friendly: boolean
          name: string
          notes: string | null
          recruitment_region: string | null
          region: string | null
        }
        Insert: {
          city?: string | null
          client_id: string
          id?: string
          is_commute_friendly?: boolean
          name: string
          notes?: string | null
          recruitment_region?: string | null
          region?: string | null
        }
        Update: {
          city?: string | null
          client_id?: string
          id?: string
          is_commute_friendly?: boolean
          name?: string
          notes?: string | null
          recruitment_region?: string | null
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_roles: {
        Row: {
          audience_objections: string[] | null
          audience_triggers: string[] | null
          care_domain: string | null
          client_id: string
          description: string | null
          employment_type: string | null
          hours_type: string | null
          id: string
          qualifications: string[] | null
          role_title: string
        }
        Insert: {
          audience_objections?: string[] | null
          audience_triggers?: string[] | null
          care_domain?: string | null
          client_id: string
          description?: string | null
          employment_type?: string | null
          hours_type?: string | null
          id?: string
          qualifications?: string[] | null
          role_title: string
        }
        Update: {
          audience_objections?: string[] | null
          audience_triggers?: string[] | null
          care_domain?: string | null
          client_id?: string
          description?: string | null
          employment_type?: string | null
          hours_type?: string | null
          id?: string
          qualifications?: string[] | null
          role_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_roles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_usps: {
        Row: {
          client_id: string
          id: string
          sort_order: number | null
          usp_text: string
        }
        Insert: {
          client_id: string
          id?: string
          sort_order?: number | null
          usp_text: string
        }
        Update: {
          client_id?: string
          id?: string
          sort_order?: number | null
          usp_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_usps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          care_type: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          meta_name_filter: string | null
          meta_page_id: string | null
          mission: string | null
          name: string
          slug: string | null
          updated_at: string
          vision: string | null
          website_url: string | null
        }
        Insert: {
          care_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          meta_name_filter?: string | null
          meta_page_id?: string | null
          mission?: string | null
          name: string
          slug?: string | null
          updated_at?: string
          vision?: string | null
          website_url?: string | null
        }
        Update: {
          care_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          meta_name_filter?: string | null
          meta_page_id?: string | null
          mission?: string | null
          name?: string
          slug?: string | null
          updated_at?: string
          vision?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      copy_suggestions: {
        Row: {
          analysis_notes: string | null
          client_id: string
          created_at: string
          creative_upload_id: string
          cta_suggestions: string[] | null
          headlines: string[] | null
          id: string
          primary_text: string[] | null
          status: string | null
        }
        Insert: {
          analysis_notes?: string | null
          client_id: string
          created_at?: string
          creative_upload_id: string
          cta_suggestions?: string[] | null
          headlines?: string[] | null
          id?: string
          primary_text?: string[] | null
          status?: string | null
        }
        Update: {
          analysis_notes?: string | null
          client_id?: string
          created_at?: string
          creative_upload_id?: string
          cta_suggestions?: string[] | null
          headlines?: string[] | null
          id?: string
          primary_text?: string[] | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_suggestions_creative_upload_id_fkey"
            columns: ["creative_upload_id"]
            isOneToOne: false
            referencedRelation: "creative_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_copy_feedback: {
        Row: {
          created_at: string
          generation_id: string
          id: string
          notes: string | null
          rating: string
        }
        Insert: {
          created_at?: string
          generation_id: string
          id?: string
          notes?: string | null
          rating: string
        }
        Update: {
          created_at?: string
          generation_id?: string
          id?: string
          notes?: string | null
          rating?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_copy_feedback_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "creative_copy_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_copy_generations: {
        Row: {
          alt_headline: string | null
          analysis_notes: string | null
          client_id: string
          created_at: string
          creative_upload_id: string
          cta_suggestion: string | null
          headline: string | null
          id: string
          primary_text: string | null
          status: string | null
        }
        Insert: {
          alt_headline?: string | null
          analysis_notes?: string | null
          client_id: string
          created_at?: string
          creative_upload_id: string
          cta_suggestion?: string | null
          headline?: string | null
          id?: string
          primary_text?: string | null
          status?: string | null
        }
        Update: {
          alt_headline?: string | null
          analysis_notes?: string | null
          client_id?: string
          created_at?: string
          creative_upload_id?: string
          cta_suggestion?: string | null
          headline?: string | null
          id?: string
          primary_text?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_copy_generations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_copy_generations_creative_upload_id_fkey"
            columns: ["creative_upload_id"]
            isOneToOne: false
            referencedRelation: "creative_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_uploads: {
        Row: {
          briefing_id: string | null
          client_id: string
          created_at: string
          creative_type: string | null
          file_name: string
          file_path: string
          file_type: string | null
          id: string
          notes: string | null
          status: string | null
          uploaded_by: string | null
        }
        Insert: {
          briefing_id?: string | null
          client_id: string
          created_at?: string
          creative_type?: string | null
          file_name: string
          file_path: string
          file_type?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          uploaded_by?: string | null
        }
        Update: {
          briefing_id?: string | null
          client_id?: string
          created_at?: string
          creative_type?: string | null
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_uploads_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "generated_briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eva_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_briefings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campaign_request_id: string
          client_id: string
          content: Json
          created_at: string
          id: string
          requested_by: string | null
          status: string | null
          version: number
          week_number: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_request_id: string
          client_id: string
          content?: Json
          created_at?: string
          id?: string
          requested_by?: string | null
          status?: string | null
          version?: number
          week_number?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_request_id?: string
          client_id?: string
          content?: Json
          created_at?: string
          id?: string
          requested_by?: string | null
          status?: string | null
          version?: number
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_briefings_campaign_request_id_fkey"
            columns: ["campaign_request_id"]
            isOneToOne: false
            referencedRelation: "campaign_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_briefings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_favorites: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_favorites_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inspiration_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_items: {
        Row: {
          ad_library_url: string | null
          advertiser_logo_url: string | null
          advertiser_name: string | null
          advertiser_page_url: string | null
          created_at: string
          cta: string | null
          external_id: string | null
          headline: string | null
          id: string
          image_url: string | null
          media_type: string | null
          primary_text: string | null
          search_id: string | null
          started_running: string | null
        }
        Insert: {
          ad_library_url?: string | null
          advertiser_logo_url?: string | null
          advertiser_name?: string | null
          advertiser_page_url?: string | null
          created_at?: string
          cta?: string | null
          external_id?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          media_type?: string | null
          primary_text?: string | null
          search_id?: string | null
          started_running?: string | null
        }
        Update: {
          ad_library_url?: string | null
          advertiser_logo_url?: string | null
          advertiser_name?: string | null
          advertiser_page_url?: string | null
          created_at?: string
          cta?: string | null
          external_id?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          media_type?: string | null
          primary_text?: string | null
          search_id?: string | null
          started_running?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_items_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "inspiration_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_searches: {
        Row: {
          ai_summary: string | null
          country: string
          created_at: string
          created_by: string | null
          id: string
          media_type: string
          query: string
          raw_markdown: string | null
          result_count: number
        }
        Insert: {
          ai_summary?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          media_type?: string
          query: string
          raw_markdown?: string | null
          result_count?: number
        }
        Update: {
          ai_summary?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          media_type?: string
          query?: string
          raw_markdown?: string | null
          result_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
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
