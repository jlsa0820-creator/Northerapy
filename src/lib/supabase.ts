import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vmoomnoiburpbmrbspwb.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtb29tbm9pYnVycGJtcmJzcHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NTM3MTgsImV4cCI6MjEwMzUyOTcxOH0.d1yC4nRopgfLCQG1vVWyWr7UNDC_cTHejdYczSCBzDA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
