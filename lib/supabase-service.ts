import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy-init so `next build` doesn't crash when env vars are not set locally.
let supabaseService: SupabaseClient | null = null;

export function getSupabaseService(): SupabaseClient {
  if (supabaseService) return supabaseService;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL"
    );
  }

  // Server-only Supabase client (used for privileged RPC inside API routes).
  supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseService;
}

