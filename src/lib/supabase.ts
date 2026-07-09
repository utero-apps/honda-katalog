import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.carubra.com";
// Fallback to a dummy key during build/evaluation to prevent crashes when environment variables are not injected yet
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-key-for-build";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: "honda",
  },
});

