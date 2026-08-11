import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabase";

export type AdminContext = {
  user: User;
  client: SupabaseClient;
};

/**
 * Server-side admin gate for API routes.
 * Never rely on AdminGuard alone.
 */
export async function requireAdmin(
  request: Request
): Promise<AdminContext | NextResponse> {
  const { user, client } = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user, client };
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
