import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function createSupabaseWithAuth(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabaseKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getAccessTokenFromRequest(
  request: Request
): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || null;
  }
  return null;
}

export async function getRequestUser(
  request: Request
): Promise<{ user: User | null; client: SupabaseClient }> {
  const token = await getAccessTokenFromRequest(request);
  if (!token) {
    return { user: null, client: supabase };
  }

  const client = createSupabaseWithAuth(token);
  const {
    data: { user },
  } = await client.auth.getUser();

  return { user, client };
}
